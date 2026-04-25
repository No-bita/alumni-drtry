import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { BULLETIN_CONTENT_MAX_LENGTH, BULLETIN_RESPONSE_MESSAGE_MAX_LENGTH } from "../constants/bulletin.js";
import { AppError } from "../lib/errors.js";

const createIntentcastSchema = z.object({
  category: z.enum(["hiring", "mentorship", "collaboration", "guidance"]),
  content: z.string().max(BULLETIN_CONTENT_MAX_LENGTH)
});

const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  category: z.enum(["hiring", "mentorship", "collaboration", "guidance"]).optional(),
  status: z.enum(["open", "closed"]).default("open"),
  mine: z.coerce.boolean().optional(),
  authorHistory: z.coerce.boolean().optional(),
  /** When true, author-soft-deleted posts are excluded for all viewers (Career Opportunities). */
  excludeAuthorSoftDeleted: z.coerce.boolean().optional()
});

const intentcastParamsSchema = z.object({
  id: z.string().uuid()
});

const respondIntentcastSchema = z.object({
  message: z.string().max(BULLETIN_RESPONSE_MESSAGE_MAX_LENGTH)
});

const updateIntentcastSchema = z.object({
  category: z.enum(["hiring", "mentorship", "collaboration", "guidance"]).optional(),
  content: z.string().max(BULLETIN_CONTENT_MAX_LENGTH).optional()
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
    void app.adminMetricsService
      .logBetaUsageEvent({
        eventType: "intentcast_posted",
        personId: request.actor.personId,
        route: request.routeOptions.url ?? request.url,
        metadata: { category: parsed.data.category }
      })
      .catch((error) => {
        request.log.warn({ err: error }, "Failed to log beta usage event.");
      });
    return reply.code(201).send({ intentcast });
  });

  app.get("/v1/intentcasts", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = feedQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError(400, "INTENTCAST_BAD_REQUEST", "Invalid intentcast feed query.");
    }

    if (parsed.data.authorHistory && !parsed.data.mine) {
      throw new AppError(
        400,
        "INTENTCAST_BAD_REQUEST",
        "authorHistory requires mine=true."
      );
    }

    const result = await app.intentcastService.listFeed(
      request.actor.personId,
      parsed.data.limit,
      parsed.data.offset,
      {
        category: parsed.data.category,
        status: parsed.data.status,
        mine: parsed.data.mine,
        authorHistory: parsed.data.authorHistory,
        excludeAuthorSoftDeleted: parsed.data.excludeAuthorSoftDeleted
      }
    );
    return reply.code(200).send(result);
  });

  app.get(
    "/v1/intentcasts/:id",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = intentcastParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new AppError(400, "INTENTCAST_BAD_REQUEST", "Invalid intentcast id.");
      }
      const intentcast = await app.intentcastService.getFeedItemForViewer(
        request.actor.personId,
        params.data.id
      );
      if (!intentcast) {
        throw new AppError(404, "INTENTCAST_NOT_FOUND", "Intentcast not found.");
      }
      return reply.code(200).send({ intentcast });
    }
  );

  app.patch(
    "/v1/intentcasts/:id",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = intentcastParamsSchema.safeParse(request.params);
      const parsed = updateIntentcastSchema.safeParse(request.body);
      if (!params.success || !parsed.success) {
        throw new AppError(400, "INTENTCAST_BAD_REQUEST", "Invalid intentcast update payload.");
      }
      if (
        parsed.data.content === undefined &&
        parsed.data.category === undefined
      ) {
        throw new AppError(400, "INTENTCAST_BAD_REQUEST", "Nothing to update.");
      }
      const intentcast = await app.intentcastService.updateIntentcast(
        request.actor.personId,
        params.data.id,
        parsed.data
      );
      return reply.code(200).send({ intentcast });
    }
  );

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

  app.delete(
    "/v1/intentcasts/:id",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = intentcastParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new AppError(400, "INTENTCAST_BAD_REQUEST", "Invalid intentcast id.");
      }
      const intentcast = await app.intentcastService.deleteIntentcast(
        request.actor.personId,
        params.data.id
      );
      return reply.code(200).send({ intentcast });
    }
  );

  app.post(
    "/v1/intentcasts/:id/restore",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = intentcastParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new AppError(400, "INTENTCAST_BAD_REQUEST", "Invalid intentcast id.");
      }
      const intentcast = await app.intentcastService.undoDeleteIntentcast(
        request.actor.personId,
        params.data.id
      );
      return reply.code(200).send({ intentcast });
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
      void app.adminMetricsService
        .logBetaUsageEvent({
          eventType: "intentcast_responded",
          personId: request.actor.personId,
          route: request.routeOptions.url ?? request.url,
          metadata: { intentcastId: params.data.id, messageLength: parsed.data.message.length }
        })
        .catch((error) => {
          request.log.warn({ err: error }, "Failed to log beta usage event.");
        });
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

