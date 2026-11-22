import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";
import { PERSON_AREAS_MAX } from "../lib/personAreas.js";

/** The service normalises and checks lengths; this only bounds the payload. */
const putAreasSchema = z.object({
  areas: z.array(z.string().max(200)).max(PERSON_AREAS_MAX)
});

const suggestQuerySchema = z.object({
  q: z.string().max(200).default("")
});

/** Areas of experience: the signed-in member's own list, and suggestions while typing one. */
export const areaRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/me/areas", { preHandler: app.authenticate }, async (request, reply) => {
    const areas = await app.personAreaService.listMyAreas(request.actor.personId);
    return reply.code(200).send({ areas });
  });

  app.put(
    "/v1/me/areas",
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
    async (request, reply) => {
      const parsed = putAreasSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(400, "AREAS_BAD_REQUEST", `Add up to ${PERSON_AREAS_MAX} areas.`);
      }
      const areas = await app.personAreaService.replaceMyAreas(request.actor.personId, parsed.data.areas);
      return reply.code(200).send({ areas });
    }
  );

  app.get("/v1/areas/suggestions", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = suggestQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError(400, "AREAS_BAD_REQUEST", "Invalid suggestion query.");
    }
    const suggestions = await app.personAreaService.suggestAreas(parsed.data.q, Boolean(request.actor.isDemo));
    return reply.code(200).send({ suggestions });
  });
};
