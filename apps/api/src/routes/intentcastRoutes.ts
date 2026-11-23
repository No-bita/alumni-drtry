import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { BULLETIN_CONTENT_MAX_LENGTH, BULLETIN_RESPONSE_MESSAGE_MAX_LENGTH } from "../constants/bulletin.js";
import { AppError } from "../lib/errors.js";
import { isAdminRole } from "../lib/postAudience.js";
import { INTENTCAST_RESOLVED_OUTCOMES, type IntentcastCategory } from "../repos/intentcastRepo.js";

const intentcastCategoryEnum = z.enum(["hiring", "mentorship", "collaboration", "guidance"]);

/**
 * Who can see a post (migration 067): which choices are ticked, never their values (the server reads
 * those from the author's profile). Strict: unknown keys are refused, not ignored.
 */
const audienceSchema = z
  .object({
    /** Institute key from GET /v1/intentcasts/audience-options; null = all institutes. */
    institution: z.string().min(1).max(80).nullable().optional(),
    batch: z.boolean().optional(),
    department: z.boolean().optional(),
    city: z.boolean().optional(),
    cityPlaceId: z.string().uuid().optional()
  })
  .strict()
  .refine((value) => !value.cityPlaceId || value.city === true, { message: "A city target requires city audience." });

const createIntentcastSchema = z.object({
  category: intentcastCategoryEnum,
  /** Ask / Offer / Invitation: required by the Wall composer; structured flows may omit it (unmarked). */
  kind: z.enum(["ask", "offer", "invitation"]).nullable().optional(),
  content: z.string().max(BULLETIN_CONTENT_MAX_LENGTH),
  /** Cities v1: tag the post with a city (canonical place id), e.g. "Post a meetup idea". */
  placeId: z.string().uuid().nullable().optional(),
  /** Missing or null = Everyone. Fixed once posted (PATCH never takes it). */
  audience: audienceSchema.nullable().optional()
});

const audiencePreviewSchema = z.object({ audience: audienceSchema.nullable() });

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

/** Most Wall posts (with their authors) one feed request returns. */
export const FEED_PAGE_MAX = 48;

const feedQuerySchema = z.object({
  scope: z.literal("home_wall").optional(),
  // Anti-scraping: clamped to FEED_PAGE_MAX (the web asks for 48 at most).
  limit: z.coerce.number().int().min(1).max(100).default(20).transform((v) => Math.min(v, FEED_PAGE_MAX)),
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

/** Optional body for closing: `{ outcome }` closes as resolved (Business progress steps, migration 068). */
const closeIntentcastSchema = z
  .object({ outcome: z.enum(INTENTCAST_RESOLVED_OUTCOMES).optional() })
  .strict();

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
  app.patch("/v1/admin/intentcasts/:id/pin", { preHandler: [app.authenticate, app.requireAdmin, app.requireNonDemoMutation] }, async (request, reply) => {
    const params = intentcastParamsSchema.safeParse(request.params);
    const body = z.object({ pinned: z.boolean() }).strict().safeParse(request.body);
    if (!params.success || !body.success) throw new AppError(400, "WALL_PIN_BAD_REQUEST", "Invalid pin request.");
    return reply.code(200).send(await app.intentcastService.setWallPin(request.actor, params.data.id, body.data.pinned));
  });

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
        // Which audience choices were used (names only, never the values).
        metadata: {
          category: parsed.data.category,
          audience: intentcast.audience ? intentcast.audience.parts : ["everyone"]
        }
      })
      .catch((error) => {
        request.log.warn({ err: error }, "Failed to log beta usage event.");
      });
    return reply.code(201).send({ intentcast });
  });

  /** The audience picker's choices for this author: institutes plus their own batch, department, city. */
  app.get("/v1/intentcasts/audience-options", { preHandler: app.authenticate }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const options = await app.intentcastService.getAudienceOptions(request.actor.personId);
    return reply.code(200).send(options);
  });

  /**
   * Label and ROUNDED size of an audience while composing. Counts members, so it is limited like the
   * other member-listing reads.
   */
  app.post("/v1/intentcasts/audience-preview", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = audiencePreviewSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, "AUDIENCE_BAD_REQUEST", "Invalid audience.");
    }
    await app.discoveryLimiter.assert(request.actor, request.ip);
    reply.header("Cache-Control", "no-store");
    const preview = await app.intentcastService.previewAudience(request.actor.personId, parsed.data.audience);
    return reply.code(200).send(preview);
  });

  app.get("/v1/intentcasts", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = feedQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError(400, "INTENTCAST_BAD_REQUEST", "Invalid intentcast feed query.");
    }

    if (parsed.data.scope && (parsed.data.mine || parsed.data.authorHistory || parsed.data.status !== "open")) {
      throw new AppError(400, "INTENTCAST_BAD_REQUEST", "Home Wall scope requires the open shared feed.");
    }

    if (parsed.data.authorHistory && !parsed.data.mine) {
      throw new AppError(
        400,
        "INTENTCAST_BAD_REQUEST",
        "authorHistory requires mine=true."
      );
    }

    // The feed lists members (author name, batch, role): a discovery read like the directory.
    await app.discoveryLimiter.assert(request.actor, request.ip);

    const excludeCategories = parseExcludeCategories(parsed.data.excludeCategories);

    const result = await app.intentcastService.listFeed(
      request.actor.personId,
      parsed.data.limit,
      parsed.data.offset,
      {
        homeWall: parsed.data.scope === "home_wall",
        category: parsed.data.category,
        status: parsed.data.status,
        mine: parsed.data.mine,
        authorHistory: parsed.data.authorHistory,
        // Already safe on the server: deleted/suspended accounts are always excluded, and a post its author
        // removed is visible only to that author (for undo). This flag only hides it from the author too.
        excludeAuthorSoftDeleted: parsed.data.excludeAuthorSoftDeleted,
        excludeCategories,
        // Admins see every post, including ones outside their audience (from the actor's role only).
        viewerIsAdmin: isAdminRole(request.actor.role)
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
        params.data.id,
        isAdminRole(request.actor.role)
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
      // No body (or an empty one) = a plain close, as before.
      const body = closeIntentcastSchema.safeParse(request.body ?? {});
      if (!body.success) {
        throw new AppError(400, "INTENTCAST_BAD_REQUEST", "Invalid close payload.");
      }
      await app.intentcastService.closeIntentcast(request.actor.personId, params.data.id, body.data.outcome);
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
};

