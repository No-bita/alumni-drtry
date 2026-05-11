import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";

const createPlaceSchema = z.object({
  country: z.string().trim().min(1).max(120),
  cityLabel: z.string().trim().min(1).max(120)
});

const mergePlacesSchema = z.object({
  winnerId: z.string().uuid(),
  loserId: z.string().uuid()
});

const remapPlacesSchema = z.object({
  fromCanonicalId: z.string().uuid(),
  toCanonicalId: z.string().uuid()
});

const addAliasSchema = z.object({
  aliasRaw: z.string().trim().min(1).max(120)
});

const placeParamsSchema = z.object({
  placeId: z.string().uuid()
});

const listPlacesQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(80)
});

export const adminPlacesRoutes: FastifyPluginAsync = async (app) => {
  const adminPreHandlers = [app.authenticate, app.requireAdmin];

  app.get(
    "/v1/admin/places",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const parsed = listPlacesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(400, "ADMIN_PLACES_BAD_REQUEST", "Invalid query parameters.");
      }
      const places = await app.adminPlacesService.listPlaces(parsed.data.q, parsed.data.limit);
      return reply.code(200).send({ places });
    }
  );

  app.post(
    "/v1/admin/places",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const body = createPlaceSchema.safeParse(request.body);
      if (!body.success) {
        throw new AppError(400, "ADMIN_PLACES_BAD_REQUEST", "Invalid create-place payload.");
      }
      const place = await app.adminPlacesService.createPlace(body.data.country, body.data.cityLabel);
      return reply.code(201).send({ place });
    }
  );

  app.post(
    "/v1/admin/places/merge",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const body = mergePlacesSchema.safeParse(request.body);
      if (!body.success) {
        throw new AppError(400, "ADMIN_PLACES_BAD_REQUEST", "Invalid merge payload.");
      }
      await app.adminPlacesService.mergePlaces(body.data.winnerId, body.data.loserId);
      return reply.code(204).send();
    }
  );

  app.post(
    "/v1/admin/places/remap",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const body = remapPlacesSchema.safeParse(request.body);
      if (!body.success) {
        throw new AppError(400, "ADMIN_PLACES_BAD_REQUEST", "Invalid remap payload.");
      }
      const result = await app.adminPlacesService.remapPeopleResidence(
        body.data.fromCanonicalId,
        body.data.toCanonicalId
      );
      return reply.code(200).send(result);
    }
  );

  app.post(
    "/v1/admin/places/:placeId/aliases",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const params = placeParamsSchema.safeParse(request.params);
      const body = addAliasSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        throw new AppError(400, "ADMIN_PLACES_BAD_REQUEST", "Invalid alias payload.");
      }
      await app.adminPlacesService.addAlias(params.data.placeId, body.data.aliasRaw);
      return reply.code(204).send();
    }
  );
};
