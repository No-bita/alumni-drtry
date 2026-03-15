import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";

const createIntentcastSchema = z.object({
  content: z.string().max(2000)
});

const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(400).optional()
});

const intentcastParamsSchema = z.object({
  id: z.string().uuid()
});

const respondIntentcastSchema = z.object({
  message: z.string().max(2000)
});

export const intentcastRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/intentcasts", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = createIntentcastSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, "INTENTCAST_BAD_REQUEST", "Invalid intentcast payload.");
    }

    const intentcast = await app.intentcastService.createIntentcast(
      request.actor.personId,
      parsed.data
    );
    return reply.code(201).send({ intentcast });
  });

  app.get("/v1/intentcasts", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = feedQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError(400, "INTENTCAST_BAD_REQUEST", "Invalid intentcast feed query.");
    }

    const result = await app.intentcastService.listFeed(
      request.actor.personId,
      parsed.data.limit,
      parsed.data.cursor
    );
    return reply.code(200).send(result);
  });

  app.patch(
    "/v1/intentcasts/:id/close",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = intentcastParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new AppError(400, "INTENTCAST_BAD_REQUEST", "Invalid intentcast id.");
      }
      await app.intentcastService.closeIntentcast(request.actor.personId, params.data.id);
      return reply.code(204).send();
    }
  );

  app.post(
    "/v1/intentcasts/:id/respond",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = intentcastParamsSchema.safeParse(request.params);
      const parsed = respondIntentcastSchema.safeParse(request.body);
      if (!params.success || !parsed.success) {
        throw new AppError(400, "INTENTCAST_BAD_REQUEST", "Invalid intentcast response payload.");
      }

      const response = await app.intentcastService.respondToIntentcast(
        request.actor.personId,
        params.data.id,
        parsed.data
      );
      return reply.code(201).send({ response });
    }
  );

  app.get(
    "/v1/intentcasts/:id/responses",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = intentcastParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new AppError(400, "INTENTCAST_BAD_REQUEST", "Invalid intentcast id.");
      }
      const responses = await app.intentcastService.listResponses(params.data.id, request.actor.personId);
      return reply.code(200).send({ responses });
    }
  );
};

