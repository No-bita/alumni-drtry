import type { FastifyPluginAsync } from "fastify";

export const homeRoutes: FastifyPluginAsync = async (app) => {
  /** Aggregate counts only (no people, no names) for the Home reassurance line. */
  app.get("/v1/home/summary", { preHandler: app.authenticate }, async (request, reply) => {
    const counts = await app.homeSummaryService.summary(request.actor.personId, Boolean(request.actor.isDemo));
    return reply.code(200).send(counts);
  });
};
