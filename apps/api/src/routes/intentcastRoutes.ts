import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { BULLETIN_CONTENT_MAX_LENGTH, BULLETIN_RESPONSE_MESSAGE_MAX_LENGTH } from "../constants/bulletin.js";
import { AppError } from "../lib/errors.js";
import type { IntentcastCategory } from "../repos/intentcastRepo.js";

const intentcastCategoryEnum = z.enum(["hiring", "mentorship", "collaboration", "guidance"]);

const createIntentcastSchema = z.object({
  category: intentcastCategoryEnum,
  content: z.string().max(BULLETIN_CONTENT_MAX_LENGTH)
});

/** Query helper — comma-separated `category` tokens */
function parseExcludeCategories(raw: string | undefined): IntentcastCategory[] | undefined {
  if (!raw?.trim()) return undefined;
  const tokens = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (tokens.length === 0) return undefined;
  for (const t of tokens) {
    const r = intentcastCategoryEnum.safeParse(t);
    if (!r.success) {
      throw new AppError(
        400,
        "INTENTCAST_BAD_REQUEST",
        `Invalid excludeCategories — unknown category token "${t}" (use hiring, mentorship, collaboration, guidance).`
      );
    }
  }
  return tokens as IntentcastCategory[];
}

const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  category: intentcastCategoryEnum.optional(),
  status: z.enum(["open", "closed"]).default("open"),
  mine: z.coerce.boolean().optional(),
  authorHistory: z.coerce.boolean().optional(),
  /** When true, author-soft-deleted posts are excluded for all viewers (Career Opportunities). */
  excludeAuthorSoftDeleted: z.coerce.boolean().optional(),
  /**
   * Comma-separated categories to drop from this feed query (e.g. `guidance` for Careers activity).
   */
  excludeCategories: z.string().optional()
});

const intentcastParamsSchema = z.object({
  id: z.string().uuid()
});

const receivedResponsesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(48),
  offset: z.coerce.number().int().min(0).default(0)
});

const respondIntentcastSchema = z.object({
  message: z.string().max(BULLETIN_RESPONSE_MESSAGE_MAX_LENGTH)
});

const updateIntentcastSchema = z.object({
  category: intentcastCategoryEnum.optional(),
  content: z.string().max(BULLETIN_CONTENT_MAX_LENGTH).optional()
});

export const intentcastRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/v1/intentcasts",
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
    async (request, reply) => {
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

    const excludeCategories = parseExcludeCategories(parsed.data.excludeCategories);

    const result = await app.intentcastService.listFeed(
      request.actor.personId,
      parsed.data.limit,
      parsed.data.offset,
      {
        category: parsed.data.category,
        status: parsed.data.status,
        mine: parsed.data.mine,
        authorHistory: parsed.data.authorHistory,
        excludeAuthorSoftDeleted: parsed.data.excludeAuthorSoftDeleted,
        excludeCategories
      }
    );
    return reply.code(200).send(result);
  });

  app.get("/v1/intentcasts/me/received-responses", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = receivedResponsesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError(400, "INTENTCAST_BAD_REQUEST", "Invalid received responses query.");
    }
    const payload = await app.intentcastService.listReceivedResponsesFeed(
      request.actor.personId,
      parsed.data.limit,
      parsed.data.offset
    );
    return reply.code(200).send(payload);
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
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
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
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
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
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
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
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
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
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
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

