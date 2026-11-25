import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";

const params = z.object({ id: z.string().uuid() });
/**
 * Text only: one string and nothing else (no attachments, no formatting fields). The length rule
 * (BROKER_MESSAGE_MAX_CHARS, after trimming) is the service's; this bound only refuses huge bodies early.
 */
const messageSchema = z.object({ body: z.string().max(5000) }).strict();

/**
 * Brokered conversations: once someone says yes, the asker and that helper talk here, tied to the
 * request. Only those two can read or write (anyone else gets 404); limits live in the service.
 */
export const brokerConversationRoutes: FastifyPluginAsync = async (app) => {
  const requestId = (raw: unknown): string => {
    const parsed = params.safeParse(raw);
    if (!parsed.success) throw new AppError(400, "BROKER_BAD_REQUEST", "Invalid request id.");
    return parsed.data.id;
  };

  app.get("/v1/broker-requests/:id/conversation", { preHandler: app.authenticate }, async (request, reply) => {
    const conversation = await app.brokerConversationService.get(request.actor.personId, requestId(request.params));
    return reply.code(200).send({ conversation });
  });

  app.post(
    "/v1/broker-requests/:id/conversation/messages",
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
    async (request, reply) => {
      const id = requestId(request.params);
      const body = messageSchema.safeParse(request.body);
      if (!body.success) throw new AppError(400, "BROKER_MESSAGE_INVALID", "Send a text message.");
      const message = await app.brokerConversationService.send(request.actor.personId, id, body.data.body);
      return reply.code(201).send({ message });
    }
  );

  /** Read up to now: clears the unread count and the message notification for this conversation. */
  app.post("/v1/broker-requests/:id/conversation/read", { preHandler: app.authenticate }, async (request, reply) => {
    await app.brokerConversationService.markRead(request.actor.personId, requestId(request.params));
    return reply.code(204).send();
  });

  /** Either person can close (leave) it: it stays readable, and nobody can write again. */
  app.post(
    "/v1/broker-requests/:id/conversation/close",
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
    async (request, reply) => {
      await app.brokerConversationService.close(request.actor.personId, requestId(request.params));
      return reply.code(204).send();
    }
  );
};
