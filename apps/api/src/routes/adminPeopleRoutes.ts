import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";

const adminPersonParamsSchema = z.object({
  id: z.string().uuid()
});

const updateAdminPersonSchema = z.object({
  role: z.enum(["alumni", "admin"]).optional(),
  suspendedAt: z
    .union([z.string().datetime(), z.null()])
    .optional()
    .transform((v) => (v === null ? null : v ? new Date(v) : undefined))
});

const betaAllowedEmailSchema = z.object({
  institutionalEmail: z.string().email(),
  notes: z.string().max(500).optional()
});

const betaAllowedEmailRevokeSchema = z.object({
  institutionalEmail: z.string().email()
});

export const adminPeopleRoutes: FastifyPluginAsync = async (app) => {
  const adminPreHandlers = [app.authenticate, app.requireAdmin];

  app.get(
    "/v1/admin/people/duplicates",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const duplicates = await app.adminPeopleService.listDuplicates();
      return reply.code(200).send({ duplicates });
    }
  );

  app.get(
    "/v1/admin/people/:id",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const params = adminPersonParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new AppError(400, "ADMIN_PERSON_BAD_REQUEST", "Invalid person ID.");
      }

      const person = await app.adminPeopleService.getPerson(params.data.id);
      return reply.code(200).send({ person });
    }
  );

  app.patch(
    "/v1/admin/people/:id",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const params = adminPersonParamsSchema.safeParse(request.params);
      const body = updateAdminPersonSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        throw new AppError(400, "ADMIN_PERSON_BAD_REQUEST", "Invalid update payload.");
      }

      const updates: { role?: "alumni" | "admin"; suspendedAt?: Date | null } = {};
      if (body.data.role !== undefined) updates.role = body.data.role;
      if (body.data.suspendedAt !== undefined) updates.suspendedAt = body.data.suspendedAt;

      const person = await app.adminPeopleService.updatePerson(
        params.data.id,
        updates,
        request.actor.personId
      );
      return reply.code(200).send({ person });
    }
  );

  app.delete(
    "/v1/admin/people/:id",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const params = adminPersonParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new AppError(400, "ADMIN_PERSON_BAD_REQUEST", "Invalid person ID.");
      }

      await app.adminPeopleService.deletePerson(params.data.id, request.actor.personId);
      return reply.code(204).send();
    }
  );

  app.get(
    "/v1/admin/beta/allowed-emails",
    { preHandler: adminPreHandlers },
    async (_request, reply) => {
      const emails = await app.adminPeopleService.listBetaAllowedEmails();
      return reply.code(200).send({ emails });
    }
  );

  app.post(
    "/v1/admin/beta/allowed-emails",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const body = betaAllowedEmailSchema.safeParse(request.body);
      if (!body.success) {
        throw new AppError(400, "ADMIN_PERSON_BAD_REQUEST", "Invalid allowed-email payload.");
      }
      const email = await app.adminPeopleService.addBetaAllowedEmail(
        body.data.institutionalEmail,
        request.actor.personId,
        body.data.notes?.trim() || null
      );
      return reply.code(200).send({ email });
    }
  );

  app.post(
    "/v1/admin/beta/allowed-emails/revoke",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const body = betaAllowedEmailRevokeSchema.safeParse(request.body);
      if (!body.success) {
        throw new AppError(400, "ADMIN_PERSON_BAD_REQUEST", "Invalid revoke payload.");
      }
      const email = await app.adminPeopleService.revokeBetaAllowedEmail(body.data.institutionalEmail);
      return reply.code(200).send({ email });
    }
  );
};
