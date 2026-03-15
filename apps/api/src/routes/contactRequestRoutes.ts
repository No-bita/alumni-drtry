import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";

const createContactRequestSchema = z.object({
  recipientPersonId: z.string().uuid(),
  message: z.string().max(3000)
});

const contactRequestParamsSchema = z.object({
  id: z.string().uuid()
});

const respondContactRequestSchema = z.object({
  action: z.enum(["accept", "decline"])
});

export const contactRequestRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/contact-requests", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = createContactRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, "CONTACT_REQUEST_BAD_REQUEST", "Invalid contact request payload.");
    }

    const result = await app.contactRequestService.createRequest(request.actor.personId, parsed.data);
    return reply.code(201).send(result);
  });

  app.patch(
    "/v1/contact-requests/:id",
    { preHandler: app.authenticate },
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

