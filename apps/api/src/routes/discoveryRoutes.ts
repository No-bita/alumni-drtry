import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";


/** Most people one directory search page returns. */
export const SEARCH_PAGE_MAX = 20;
const maxDirectoryBatchYear = new Date().getUTCFullYear() + 5;

const searchQuerySchema = z.object({
  batch: z.coerce.number().int().min(1960).max(maxDirectoryBatchYear).optional(),
  dept: z.string().trim().min(2).max(16).regex(/^[a-zA-Z0-9]+$/).optional(),
  company: z.string().trim().max(120).optional(),
  /** Soft signal only (`occupation_types.code`) — boosts matching rows, does not exclude others. */
  occ: z.string().trim().min(2).max(64).optional(),
  q: z.string().max(120).optional(),
  residenceCountry: z.string().trim().max(120).optional(),
  residenceCity: z.string().trim().max(120).optional(),
  requireResidence: z.coerce.boolean().optional(),
  // Anti-scraping: at most SEARCH_PAGE_MAX people per page (larger requests are clamped, not refused).
  limit: z.coerce.number().int().min(1).max(100).default(SEARCH_PAGE_MAX).transform((v) => Math.min(v, SEARCH_PAGE_MAX)),
  cursor: z.string().max(400).optional()
});

const profileParamsSchema = z.object({
  id: z.string().uuid()
});

export const discoveryRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/search", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError(400, "SEARCH_BAD_REQUEST", "Invalid search query parameters.");
    }

    await app.discoveryLimiter.assert(request.actor, request.ip);

    const result = await app.discoveryService.search({
      ...parsed.data,
      viewerPersonId: request.actor.personId,
      viewerIsDemo: Boolean(request.actor.isDemo)
    });
    await app.adminMetricsService.logSearch();
    void app.adminMetricsService
      .logBetaUsageEvent({
        eventType: "search_executed",
        personId: request.actor.personId,
        route: request.routeOptions.url ?? request.url,
        metadata: { limit: parsed.data.limit, hasQuery: Boolean(parsed.data.q) }
      })
      .catch((error) => {
        request.log.warn({ err: error }, "Failed to log beta usage event.");
      });
    return reply.code(200).send(result);
  });

  app.get("/v1/profiles/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = profileParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      throw new AppError(400, "PROFILE_BAD_REQUEST", "Invalid profile id.");
    }

    await app.discoveryLimiter.assert(request.actor, request.ip);

    const result = await app.discoveryService.getPublicProfile(
      parsed.data.id,
      request.actor.personId,
      Boolean(request.actor.isDemo)
    );
    void app.adminMetricsService
      .logBetaUsageEvent({
        eventType: "profile_viewed",
        personId: request.actor.personId,
        route: request.routeOptions.url ?? request.url,
        metadata: { profileId: parsed.data.id }
      })
      .catch((error) => {
        request.log.warn({ err: error }, "Failed to log beta usage event.");
      });
    return reply.code(200).send(result);
  });
};

