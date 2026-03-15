import type { FastifyPluginAsync } from "fastify";

export const adminMetricsRoutes: FastifyPluginAsync = async (app) => {
  const adminPreHandlers = [app.authenticate, app.requireAdmin];

  app.get(
    "/v1/admin/metrics",
    { preHandler: adminPreHandlers },
    async (request, reply) => {
      const metrics = await app.adminMetricsService.getMetrics();
      return reply.code(200).send({ metrics });
    }
  );
};
