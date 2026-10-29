import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";

const pendingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional()
});

const approvedQuerySchema = z.object({
  q: z.string().max(100).optional()
});

const adminOrgParamsSchema = z.object({
  id: z.string().uuid()
});

const approveOrgSchema = z.object({
  canonicalOrganizationId: z.string().uuid().nullable().optional()
});

const renameOrgSchema = z.object({
  name: z.string().max(300)
});

const linkOrgSchema = z.object({
  canonicalOrganizationId: z.string().uuid()
});

const rejectOrgSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});

export const adminOrgRoutes: FastifyPluginAsync = async (app) => {
  const adminPreHandlers = [app.authenticate, app.requireAdmin];

  app.get(
    "/v1/admin/orgs/pending",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const query = pendingQuerySchema.safeParse(request.query);
      if (!query.success) {
        throw new AppError(400, "ADMIN_ORG_BAD_REQUEST", "Invalid pending organizations query.");
      }

      const organizations = await app.organizationService.listPendingOrganizations(query.data.limit);
      return reply.code(200).send({ organizations });
    }
  );

  /** "Same company as…" picker: approved companies that aren't linked to another, by name, 20 at most. */
  app.get(
    "/v1/admin/orgs/approved",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const query = approvedQuerySchema.safeParse(request.query);
      if (!query.success) {
        throw new AppError(400, "ADMIN_ORG_BAD_REQUEST", "Invalid approved organizations query.");
      }
      const organizations = await app.organizationService.searchApprovedOrganizations(query.data.q ?? "");
      return reply.code(200).send({ organizations });
    }
  );

  /** "Approved companies" section: every approved name (linked or not), by name, 50 at most. */
  app.get(
    "/v1/admin/orgs/approved/all",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const query = approvedQuerySchema.safeParse(request.query);
      if (!query.success) {
        throw new AppError(400, "ADMIN_ORG_BAD_REQUEST", "Invalid approved organizations query.");
      }
      const organizations = await app.organizationService.listApprovedCompanies(query.data.q ?? "");
      return reply.code(200).send({ organizations });
    }
  );

  /** Edit name (pending or approved). If the name is taken, nothing changes: `{ result: "taken", existing }`. */
  app.patch(
    "/v1/admin/orgs/:id/name",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const params = adminOrgParamsSchema.safeParse(request.params);
      const body = renameOrgSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        throw new AppError(400, "ADMIN_ORG_BAD_REQUEST", "Invalid organization rename payload.");
      }
      const result = await app.organizationService.renameOrganization(params.data.id, body.data.name);
      return reply.code(200).send(result);
    }
  );

  /** "Same company as…" for an approved company; names linked to it move along. */
  app.patch(
    "/v1/admin/orgs/:id/link",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const params = adminOrgParamsSchema.safeParse(request.params);
      const body = linkOrgSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        throw new AppError(400, "ADMIN_ORG_BAD_REQUEST", "Invalid organization link payload.");
      }
      const result = await app.organizationService.linkApprovedOrganization(params.data.id, body.data.canonicalOrganizationId);
      return reply.code(200).send(result);
    }
  );

  app.patch(
    "/v1/admin/orgs/:id",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const params = adminOrgParamsSchema.safeParse(request.params);
      const body = approveOrgSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        throw new AppError(400, "ADMIN_ORG_BAD_REQUEST", "Invalid organization approval payload.");
      }

      const organization = await app.organizationService.approveOrganization(
        params.data.id,
        request.actor.personId,
        body.data.canonicalOrganizationId ?? null
      );
      return reply.code(200).send({ organization });
    }
  );

  app.delete(
    "/v1/admin/orgs/:id",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const params = adminOrgParamsSchema.safeParse(request.params);
      const body = rejectOrgSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        throw new AppError(400, "ADMIN_ORG_BAD_REQUEST", "Invalid organization rejection payload.");
      }

      const organization = await app.organizationService.rejectOrganization(
        params.data.id,
        request.actor.personId,
        body.data.reason
      );
      return reply.code(200).send({ organization });
    }
  );
};

