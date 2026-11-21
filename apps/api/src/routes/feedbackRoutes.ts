import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";

const submitFeedbackSchema = z.object({
  message: z.string().trim().min(1).max(3000)
});

export const feedbackRoutes: FastifyPluginAsync = async (app) => {
  /** A signed-in member submits private feedback. Demo sessions cannot submit. */
  app.post(
    "/v1/feedback",
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
    async (request, reply) => {
      const parsed = submitFeedbackSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(400, "FEEDBACK_BAD_REQUEST", "Feedback needs a message of 1-3000 characters.");
      }

      const entry = await app.feedbackService.submit(request.actor.personId, parsed.data.message);
      return reply.code(201).send({
        feedback: { id: entry.id, createdAt: entry.createdAt.toISOString() }
      });
    }
  );

  /** Admins read all submissions, newest first, on the analytics screen. */
  app.get(
    "/v1/admin/feedback",
    { preHandler: [app.authenticate, app.requireAdmin] },
    async (_request, reply) => {
      const entries = await app.feedbackService.listForAdmin();
      return reply.code(200).send({
        feedback: entries.map((e) => ({
          id: e.id,
          authorFullName: e.authorFullName,
          message: e.message,
          createdAt: e.createdAt.toISOString()
        }))
      });
    }
  );
};
