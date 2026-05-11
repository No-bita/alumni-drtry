import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";

const uuid = z.string().uuid();

const combineCitiesBody = z.object({
  keepCityId: uuid,
  combineCityId: uuid
});

const ignoreMergeBody = z.object({
  cityOneId: uuid,
  cityTwoId: uuid
});

const mapFreeTextBody = z.object({
  displayCountry: z.string().trim().min(1).max(120),
  displayCity: z.string().trim().min(1).max(120),
  treatAsCityId: uuid
});

const createCityFromTextBody = z.object({
  displayCountry: z.string().trim().min(1).max(120),
  displayCity: z.string().trim().min(1).max(120)
});

const ignoreUnmappedBody = z.object({
  displayCountry: z.string().trim().min(1).max(120),
  displayCity: z.string().trim().min(1).max(120)
});

const placeParams = z.object({
  placeId: uuid
});

const renamePlaceBody = z.object({
  displayCity: z.string().trim().min(1).max(120)
});

const addAliasBody = z.object({
  spelling: z.string().trim().min(1).max(120)
});

const combineWithBody = z.object({
  combineCityId: uuid
});

export const adminLocationCleanupRoutes: FastifyPluginAsync = async (app) => {
  const adminHandlers = [app.authenticate, app.requireAdmin];

  app.get(
    "/v1/admin/locations/cleanup/inbox",
    { preHandler: adminHandlers },
    async (_request, reply) => {
      const inbox = await app.locationCleanupService.getInbox();
      return reply.code(200).send(inbox);
    }
  );

  app.post(
    "/v1/admin/locations/cleanup/actions/combine-cities",
    { preHandler: adminHandlers },
    async (request, reply) => {
      const body = combineCitiesBody.safeParse(request.body);
      if (!body.success) {
        throw new AppError(400, "LOCATION_CLEANUP_BAD_REQUEST", "Invalid combine request.");
      }
      await app.locationCleanupService.combineCities(
        request.actor.personId,
        body.data.keepCityId,
        body.data.combineCityId
      );
      return reply.code(204).send();
    }
  );

  app.post(
    "/v1/admin/locations/cleanup/actions/ignore-merge-suggestion",
    { preHandler: adminHandlers },
    async (request, reply) => {
      const body = ignoreMergeBody.safeParse(request.body);
      if (!body.success) {
        throw new AppError(400, "LOCATION_CLEANUP_BAD_REQUEST", "Invalid ignore payload.");
      }
      await app.locationCleanupService.ignoreMergeSuggestion(
        request.actor.personId,
        body.data.cityOneId,
        body.data.cityTwoId
      );
      return reply.code(204).send();
    }
  );

  app.post(
    "/v1/admin/locations/cleanup/actions/map-free-text-to-city",
    { preHandler: adminHandlers },
    async (request, reply) => {
      const body = mapFreeTextBody.safeParse(request.body);
      if (!body.success) {
        throw new AppError(400, "LOCATION_CLEANUP_BAD_REQUEST", "Invalid mapping payload.");
      }
      const result = await app.locationCleanupService.mapFreeTextToCity(
        request.actor.personId,
        body.data.displayCountry,
        body.data.displayCity,
        body.data.treatAsCityId
      );
      return reply.code(200).send(result);
    }
  );

  app.post(
    "/v1/admin/locations/cleanup/actions/create-city-from-text",
    { preHandler: adminHandlers },
    async (request, reply) => {
      const body = createCityFromTextBody.safeParse(request.body);
      if (!body.success) {
        throw new AppError(400, "LOCATION_CLEANUP_BAD_REQUEST", "Invalid create-city payload.");
      }
      const result = await app.locationCleanupService.createCityFromFreeText(
        request.actor.personId,
        body.data.displayCountry,
        body.data.displayCity
      );
      return reply.code(201).send(result);
    }
  );

  app.post(
    "/v1/admin/locations/cleanup/actions/ignore-unmapped-cluster",
    { preHandler: adminHandlers },
    async (request, reply) => {
      const body = ignoreUnmappedBody.safeParse(request.body);
      if (!body.success) {
        throw new AppError(400, "LOCATION_CLEANUP_BAD_REQUEST", "Invalid ignore payload.");
      }
      await app.locationCleanupService.ignoreUnmappedCluster(
        request.actor.personId,
        body.data.displayCountry,
        body.data.displayCity
      );
      return reply.code(204).send();
    }
  );

  app.get(
    "/v1/admin/locations/places/:placeId",
    { preHandler: adminHandlers },
    async (request, reply) => {
      const params = placeParams.safeParse(request.params);
      if (!params.success) {
        throw new AppError(400, "LOCATION_CLEANUP_BAD_REQUEST", "Invalid place id.");
      }
      const detail = await app.locationCleanupService.getPlaceDetail(params.data.placeId);
      return reply.code(200).send(detail);
    }
  );

  app.post(
    "/v1/admin/locations/places/:placeId/rename-display-city",
    { preHandler: adminHandlers },
    async (request, reply) => {
      const params = placeParams.safeParse(request.params);
      const body = renamePlaceBody.safeParse(request.body);
      if (!params.success || !body.success) {
        throw new AppError(400, "LOCATION_CLEANUP_BAD_REQUEST", "Invalid rename payload.");
      }
      await app.locationCleanupService.renameCanonicalCity(request.actor.personId, params.data.placeId, body.data.displayCity);
      return reply.code(204).send();
    }
  );

  app.post(
    "/v1/admin/locations/places/:placeId/spelling-alias",
    { preHandler: adminHandlers },
    async (request, reply) => {
      const params = placeParams.safeParse(request.params);
      const body = addAliasBody.safeParse(request.body);
      if (!params.success || !body.success) {
        throw new AppError(400, "LOCATION_CLEANUP_BAD_REQUEST", "Invalid alias payload.");
      }
      await app.locationCleanupService.addAliasForPlace(request.actor.personId, params.data.placeId, body.data.spelling);
      return reply.code(204).send();
    }
  );

  app.post(
    "/v1/admin/locations/places/:placeId/combine-with-city",
    { preHandler: adminHandlers },
    async (request, reply) => {
      const params = placeParams.safeParse(request.params);
      const body = combineWithBody.safeParse(request.body);
      if (!params.success || !body.success) {
        throw new AppError(400, "LOCATION_CLEANUP_BAD_REQUEST", "Invalid combine payload.");
      }
      await app.locationCleanupService.combineIntoPlace(
        request.actor.personId,
        params.data.placeId,
        body.data.combineCityId
      );
      return reply.code(204).send();
    }
  );
};
