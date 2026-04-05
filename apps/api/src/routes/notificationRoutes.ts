import type { FastifyPluginAsync } from "fastify";

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/notifications/summary", { preHandler: app.authenticate }, async (request, reply) => {
    const count = await app.notificationService.countForPerson(request.actor.personId);
    return reply.code(200).send({ count });
  });

  app.get("/v1/notifications", { preHandler: app.authenticate }, async (request, reply) => {
    const items = await app.notificationService.listForPerson(request.actor.personId);
    return reply.code(200).send({ items });
  });
};
