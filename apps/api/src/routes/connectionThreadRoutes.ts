import type { FastifyPluginAsync } from "fastify";
import { DatabaseError } from "pg";
import { z } from "zod";
import { AppError } from "../lib/errors.js";
import type { DiscloseItemInput } from "../services/connectionThreadService.js";

const uuidParam = z.object({ threadId: z.string().uuid() });
const threadMessageParam = z.object({ threadId: z.string().uuid(), messageId: z.string().uuid() });

const createThreadBodySchema = z.object({
  recipientPersonId: z.string().uuid(),
  initialMessage: z.string().min(1).max(300),
  kind: z.enum(["general", "referral"]).optional()
});

const postMessageBodySchema = z.object({
  body: z.string().min(1).max(300),
  replyToMessageId: z.string().uuid().optional()
});
const editMessageBodySchema = z.object({
  body: z.string().min(1).max(300)
});

const discloseItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("institutional_email") }),
  z.object({ kind: z.literal("personal_email") }),
  z.object({ kind: z.literal("mobile_phone") }),
  z.object({
    kind: z.literal("profile_link"),
    profileLinkId: z.string().uuid()
  })
]);

const discloseBodySchema = z.object({
  items: z.array(discloseItemSchema).min(1).max(8)
});

const closeBodySchema = z.object({
  status: z.enum(["closed", "declined"])
});

export const connectionThreadRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/connection-threads", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = createThreadBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, "CONNECTION_THREAD_BAD_REQUEST", "Invalid body.");
    }

    const result = await app.connectionThreadService.createOrContinueThread(
      request.actor.personId,
      parsed.data.recipientPersonId,
      parsed.data.initialMessage,
      parsed.data.kind ?? "general"
    );
    void app.adminMetricsService
      .logBetaUsageEvent({
        eventType: "thread_created",
        personId: request.actor.personId,
        route: request.routeOptions.url ?? request.url,
        metadata: { recipientPersonId: parsed.data.recipientPersonId, kind: parsed.data.kind ?? "general" }
      })
      .catch((error) => {
        request.log.warn({ err: error }, "Failed to log beta usage event.");
      });
    return reply.code(201).send(result);
  });

  app.get("/v1/connection-threads", { preHandler: app.authenticate }, async (request, reply) => {
    const rows = await app.connectionThreadService.listThreadsForPerson(request.actor.personId);
    return reply.code(200).send({
      threads: rows.map((t) => ({
        id: t.id,
        initiatorPersonId: t.initiatorPersonId,
        recipientPersonId: t.recipientPersonId,
        status: t.status,
        kind: t.kind,
        updatedAt: t.updatedAt.toISOString(),
        counterpartyPersonId: t.counterpartyPersonId,
        counterpartyFullName: t.counterpartyFullName,
        counterpartyDepartmentCode: t.counterpartyDepartmentCode,
        counterpartyBatchYear: t.counterpartyBatchYear,
        lastMessageBody: t.lastMessageBody,
        lastMessageAuthorPersonId: t.lastMessageAuthorPersonId,
        lastMessageCreatedAt: t.lastMessageCreatedAt.toISOString()
      }))
    });
  });

  app.get("/v1/connection-threads/:threadId", { preHandler: app.authenticate }, async (request, reply) => {
    const params = uuidParam.safeParse(request.params);
    if (!params.success) {
      throw new AppError(400, "CONNECTION_THREAD_BAD_REQUEST", "Invalid thread id.");
    }

    const detail = await app.connectionThreadService.getThreadDetail(
      request.actor.personId,
      params.data.threadId
    );
    return reply.code(200).send(detail);
  });

  app.post(
    "/v1/connection-threads/:threadId/messages",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = uuidParam.safeParse(request.params);
      const parsed = postMessageBodySchema.safeParse(request.body);
      if (!params.success || !parsed.success) {
        throw new AppError(400, "CONNECTION_THREAD_BAD_REQUEST", "Invalid body.");
      }

      const msg = await app.connectionThreadService.addMessage(
        request.actor.personId,
        params.data.threadId,
        parsed.data.body,
        parsed.data.replyToMessageId ?? null
      );
      void app.adminMetricsService
        .logBetaUsageEvent({
          eventType: "thread_message_sent",
          personId: request.actor.personId,
          route: request.routeOptions.url ?? request.url,
          metadata: { threadId: params.data.threadId, messageLength: parsed.data.body.length }
        })
        .catch((error) => {
          request.log.warn({ err: error }, "Failed to log beta usage event.");
        });
      return reply.code(201).send({
        message: {
          id: msg.id,
          authorPersonId: msg.authorPersonId,
          body: msg.body,
          createdAt: msg.createdAt.toISOString(),
          editedAt: msg.editedAt ? msg.editedAt.toISOString() : null,
          replyTo: msg.replyTo,
          authorIsDemo: msg.authorIsDemo,
        },
      });
    }
  );

  app.patch(
    "/v1/connection-threads/:threadId/messages/:messageId",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = threadMessageParam.safeParse(request.params);
      const parsed = editMessageBodySchema.safeParse(request.body);
      if (!params.success || !parsed.success) {
        throw new AppError(400, "CONNECTION_THREAD_BAD_REQUEST", "Invalid body.");
      }
      const msg = await app.connectionThreadService.editMessage(
        request.actor.personId,
        params.data.threadId,
        params.data.messageId,
        parsed.data.body
      );
      return reply.code(200).send({
        message: {
          id: msg.id,
          authorPersonId: msg.authorPersonId,
          body: msg.body,
          createdAt: msg.createdAt.toISOString(),
          editedAt: msg.editedAt ? msg.editedAt.toISOString() : null,
          replyTo: msg.replyTo,
          authorIsDemo: msg.authorIsDemo,
        },
      });
    }
  );

  app.post(
    "/v1/connection-threads/:threadId/disclose",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = uuidParam.safeParse(request.params);
      const parsed = discloseBodySchema.safeParse(request.body);
      if (!params.success || !parsed.success) {
        throw new AppError(400, "CONNECTION_THREAD_BAD_REQUEST", "Invalid body.");
      }

      const items: DiscloseItemInput[] = parsed.data.items;
      try {
        const rows = await app.connectionThreadService.disclose(request.actor.personId, params.data.threadId, items);
        return reply.code(201).send({
          disclosures: rows.map((d) => ({
            id: d.id,
            personId: d.personId,
            kind: d.kind,
            profileLinkId: d.profileLinkId,
            disclosedValue: d.disclosedValue,
            createdAt: d.createdAt.toISOString()
          }))
        });
      } catch (e) {
        if (e instanceof DatabaseError && e.code === "23505") {
          throw new AppError(409, "CONNECTION_DISCLOSE_DUPLICATE", "You already shared that.");
        }
        throw e;
      }
    }
  );

  app.post(
    "/v1/connection-threads/:threadId/nudge/dismiss",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = uuidParam.safeParse(request.params);
      if (!params.success) {
        throw new AppError(400, "CONNECTION_THREAD_BAD_REQUEST", "Invalid thread id.");
      }

      await app.connectionThreadService.dismissNudge(request.actor.personId, params.data.threadId);
      return reply.code(204).send();
    }
  );

  app.post(
    "/v1/connection-threads/:threadId/close",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const params = uuidParam.safeParse(request.params);
      const parsed = closeBodySchema.safeParse(request.body);
      if (!params.success || !parsed.success) {
        throw new AppError(400, "CONNECTION_THREAD_BAD_REQUEST", "Invalid body.");
      }

      await app.connectionThreadService.closeThread(
        request.actor.personId,
        params.data.threadId,
        parsed.data.status
      );
      return reply.code(204).send();
    }
  );
};
