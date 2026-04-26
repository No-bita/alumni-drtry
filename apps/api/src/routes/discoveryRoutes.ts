import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { assertDiscoveryReadAllowed } from "../lib/directoryAbuseLimiter.js";
import { AppError } from "../lib/errors.js";

const currentYear = new Date().getUTCFullYear() + 1;

const searchQuerySchema = z.object({
  batch: z.coerce.number().int().min(1960).max(currentYear).optional(),
  dept: z.string().trim().min(2).max(16).regex(/^[a-zA-Z0-9]+$/).optional(),
  company: z.string().trim().max(120).optional(),
  /** Soft signal only (`occupation_types.code`) — boosts matching rows, does not exclude others. */
  occ: z.string().trim().min(2).max(64).optional(),
  q: z.string().max(120).optional(),
  residenceCountry: z.string().trim().max(120).optional(),
  residenceCity: z.string().trim().max(120).optional(),
  requireResidence: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(400).optional()
});

const profileParamsSchema = z.object({
  id: z.string().uuid()
});

const residenceCitiesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(120).default(72)
});

const profileClickBodySchema = z.object({
  searchSessionId: z.string().uuid(),
  profileId: z.string().uuid(),
  resultPosition: z.coerce.number().int().min(0).max(10_000)
});

export const discoveryRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/search", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError(400, "SEARCH_BAD_REQUEST", "Invalid search query parameters.");
    }

    assertDiscoveryReadAllowed(request.actor.personId, request.ip);

    const result = await app.discoveryService.search({
      ...parsed.data,
      viewerPersonId: request.actor.personId
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

  app.post("/v1/discovery/analytics/profile-click", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = profileClickBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, "DISCOVERY_ANALYTICS_BAD_REQUEST", "Invalid analytics payload.");
    }
    await app.discoveryService.recordDirectoryProfileClick({
      viewerPersonId: request.actor.personId,
      searchSessionId: parsed.data.searchSessionId,
      profileId: parsed.data.profileId,
      resultPosition: parsed.data.resultPosition
    });
    void app.adminMetricsService
      .logBetaUsageEvent({
        eventType: "profile_clicked",
        personId: request.actor.personId,
        route: request.routeOptions.url ?? request.url,
        metadata: { profileId: parsed.data.profileId, resultPosition: parsed.data.resultPosition }
      })
      .catch((error) => {
        request.log.warn({ err: error }, "Failed to log beta usage event.");
      });
    return reply.code(204).send();
  });

  app.get("/v1/directory/residence-cities", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = residenceCitiesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError(400, "RESIDENCE_CITIES_BAD_REQUEST", "Invalid query parameters.");
    }

    assertDiscoveryReadAllowed(request.actor.personId, request.ip);

    const cities = await app.discoveryService.listResidenceCityAggregates(parsed.data.limit);
    return reply
      .header("Cache-Control", "private, max-age=86400, stale-while-revalidate=43200")
      .code(200)
      .send({ cities });
  });

  app.get("/v1/profiles/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = profileParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      throw new AppError(400, "PROFILE_BAD_REQUEST", "Invalid profile id.");
    }

    assertDiscoveryReadAllowed(request.actor.personId, request.ip);

    const result = await app.discoveryService.getPublicProfile(parsed.data.id, request.actor.personId);
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

