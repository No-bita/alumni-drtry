import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";
import { MATCH_CATEGORIES } from "../lib/matchIntent.js";
import { noteInputSchema } from "../lib/noteDetails.js";
import { CITIES_NOTE_CATEGORIES } from "../services/contactRequestService.js";

const createContactRequestSchema = z
  .object({
    recipientPersonId: z.string().uuid(),
    /** Note form: referral or advice with its fields; the server builds the message from them. Required except for Cities notes. */
    note: noteInputSchema.optional().nullable(),
    /** Cities v1 notes stay free-text; other surfaces send the note form instead. */
    message: z.string().max(3000).optional(),
    /** Where the note was sent from, for the Ask → Match funnel (and Cities v1). Outside Cities the category comes from the note. */
    source: z.enum(["match", "whatsapp", "careers", "cities"]).optional(),
    sourceCategory: z.enum([...MATCH_CATEGORIES, ...CITIES_NOTE_CATEGORIES]).nullable().optional(),
    /** Position (1 = top) of the person in the match results, for ranking quality. */
    sourceRank: z.number().int().min(1).max(20).nullable().optional(),
    /** Cities v1: a newcomer's note answering a local's offer. */
    cityHelpOfferId: z.string().uuid().nullable().optional()
  })
  .superRefine((v, ctx) => {
    if (v.source === "cities") {
      if (!v.message || !v.message.trim()) {
        ctx.addIssue({ code: "custom", message: "Cities notes need a message.", path: ["message"] });
      }
    } else if (!v.note) {
      ctx.addIssue({ code: "custom", message: "Send a referral or advice note.", path: ["note"] });
    }
    const cat = v.sourceCategory ?? null;
    const citiesCat = cat !== null && (CITIES_NOTE_CATEGORIES as readonly string[]).includes(cat);
    if (v.source === "cities" ? !citiesCat : cat !== null && !(MATCH_CATEGORIES as readonly string[]).includes(cat)) {
      ctx.addIssue({ code: "custom", message: "Category does not fit the source.", path: ["sourceCategory"] });
    }
    if (v.cityHelpOfferId && !(v.source === "cities" && cat === "newcomer")) {
      ctx.addIssue({ code: "custom", message: "Only newcomer notes answer an offer.", path: ["cityHelpOfferId"] });
    }
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
        details: r.details,
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
        details: r.details,
        createdAt: r.createdAt.toISOString(),
        source: r.source,
        sourceCategory: r.sourceCategory
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
