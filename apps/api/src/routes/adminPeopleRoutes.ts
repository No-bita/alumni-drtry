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
};
