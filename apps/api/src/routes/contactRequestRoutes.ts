import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";
import { MATCH_CATEGORIES } from "../lib/matchIntent.js";

const createContactRequestSchema = z.object({
  recipientPersonId: z.string().uuid(),
  message: z.string().max(3000),
  /** Where the note was sent from, for the Ask → Match funnel. */
  source: z.enum(["match"]).optional(),
  sourceCategory: z.enum(MATCH_CATEGORIES).nullable().optional(),
  /** Position (1 = top) of the person in the match results, for ranking quality. */
  sourceRank: z.number().int().min(1).max(20).nullable().optional()
});

const contactRequestParamsSchema = z.object({
  id: z.string().uuid()
});

const respondContactRequestSchema = z.object({
  action: z.enum(["accept", "decline"])
});

export const contactRequestRoutes: FastifyPluginAsync = async (app) => {
  /** Notes the viewer sent, newest first (max 100). Contact is included only once accepted. */
  app.get("/v1/contact-requests/sent", { preHandler: app.authenticate }, async (request, reply) => {
    const sent = await app.contactRequestService.listSentForSender(request.actor.personId);
    return reply.code(200).send({
      requests: sent.map((r) => ({
        id: r.id,
        recipientPersonId: r.recipientPersonId,
        recipientFullName: r.recipientFullName,
        message: r.message,
        status: r.status,
        recipientContactShared: r.status === "accepted" ? r.recipientContactShared : null,
        createdAt: r.createdAt.toISOString(),
        respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null
      }))
    });
  });

  app.get("/v1/contact-requests/inbox", { preHandler: app.authenticate }, async (request, reply) => {
    const requests = await app.contactRequestService.listInboxForRecipient(request.actor.personId);
    return reply.code(200).send({
      requests: requests.map((r) => ({
        id: r.id,
        senderPersonId: r.senderPersonId,
        senderFullName: r.senderFullName,
        senderDepartmentCode: r.senderDepartmentCode,
        message: r.message,
        createdAt: r.createdAt.toISOString()
      }))
    });
  });

  app.post(
    "/v1/contact-requests",
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
    async (request, reply) => {
      const parsed = createContactRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(400, "CONTACT_REQUEST_BAD_REQUEST", "Invalid contact request payload.");
      }

      const result = await app.contactRequestService.createRequest(request.actor.personId, parsed.data);
      return reply.code(201).send(result);
    }
  );

  app.patch(
    "/v1/contact-requests/:id",
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
    async (request, reply) => {
      const params = contactRequestParamsSchema.safeParse(request.params);
      const parsed = respondContactRequestSchema.safeParse(request.body);
      if (!params.success || !parsed.success) {
        throw new AppError(
          400,
          "CONTACT_REQUEST_BAD_REQUEST",
          "Invalid contact request response payload."
        );
      }

      const result = await app.contactRequestService.respondToRequest(
        request.actor.personId,
        params.data.id,
        parsed.data
      );
      return reply.code(200).send(result);
    }
  );
};

