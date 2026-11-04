import type { FastifyPluginAsync } from "fastify";

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/notifications/summary", { preHandler: app.authenticate }, async (request, reply) => {
    const [count, unseenCount] = await Promise.all([
      app.notificationService.countForPerson(request.actor.personId),
      app.notificationService.unseenCountForPerson(request.actor.personId)
    ]);
    return reply.code(200).send({ count, unseenCount });
  });

  app.get("/v1/notifications", { preHandler: app.authenticate }, async (request, reply) => {
    const items = await app.notificationService.listForPerson(request.actor.personId);
    return reply.code(200).send({ items });
  });

  // Seen state is a watermark move only: no notification history is removed or altered.
  app.post("/v1/notifications/mark-all-seen", { preHandler: app.authenticate }, async (request, reply) => {
    await app.notificationService.markAllSeen(request.actor.personId);
    return reply.code(200).send({ ok: true });
  });
};
