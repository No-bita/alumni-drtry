import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";

const currentYear = new Date().getUTCFullYear() + 1;

const searchQuerySchema = z.object({
  batchYear: z.coerce.number().int().min(1960).max(currentYear).optional(),
  departmentCode: z.string().trim().min(2).max(16).regex(/^[a-zA-Z0-9]+$/).optional(),
  organizationId: z.string().uuid().optional(),
  occupationTypeCode: z.string().trim().min(2).max(64).optional(),
  keyword: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
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

    const result = await app.discoveryService.search(parsed.data);
    await app.adminMetricsService.logSearch();
    return reply.code(200).send(result);
  });

  app.get("/v1/profiles/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = profileParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      throw new AppError(400, "PROFILE_BAD_REQUEST", "Invalid profile id.");
    }

    const result = await app.discoveryService.getPublicProfile(parsed.data.id);
    return reply.code(200).send(result);
  });
};

