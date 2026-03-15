import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";

const suggestOrgSchema = z.object({
  name: z.string().trim().min(2).max(200)
});

export const orgRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/orgs/suggest", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = suggestOrgSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, "ORG_BAD_REQUEST", "Invalid organization suggestion payload.");
    }

    const result = await app.organizationService.suggestOrganization(
      parsed.data.name,
      request.actor.personId
    );

    return reply.code(result.created ? 201 : 200).send(result);
  });
};

