import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";
import { REJECT_REASON_MAX } from "../services/placeReviewService.js";

const stripControl = (v: string) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

const idParams = z.object({ placeId: z.string().uuid() });
const queueQuery = z.object({
  status: z.enum(["pending", "rejected"]).default("pending"),
  q: z.string().transform(stripControl).pipe(z.string().trim().max(100)).optional()
});
const approvedQuery = z.object({
  q: z.string().transform(stripControl).pipe(z.string().trim().max(100)).optional(),
  exclude: z.string().uuid().optional()
});
const approveBody = z
  .object({ cityLabel: z.string().transform(stripControl).pipe(z.string().max(200)).nullable().optional() })
  .optional();
const rejectBody = z.object({ reason: z.string().transform(stripControl).pipe(z.string().max(REJECT_REASON_MAX + 100)) });
const sameAsBody = z.object({ targetPlaceId: z.string().uuid() });
const historyQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

/**
 * City review queue (admins). Every action changes the city and writes its history in one transaction.
 * With CITY_REVIEW_ENABLED off, every route here answers 404.
 */
export const adminCityReviewRoutes: FastifyPluginAsync = async (app) => {
  const admin = { preHandler: [app.authenticate, app.requireAdmin] };
  const review = () => app.adminPlacesService.review;
  const bad = (message: string) => new AppError(400, "CITY_REVIEW_BAD_REQUEST", message);

  app.get("/v1/admin/cities/review", admin, async (request, reply) => {
    const query = queueQuery.safeParse(request.query);
    if (!query.success) throw bad("Invalid review query.");
    const cities = await review().queue(query.data.status, query.data.q ?? "");
    return reply.code(200).send({ cities });
  });

  /** "Same city as…" picker: approved cities only. */
  app.get("/v1/admin/cities/approved", admin, async (request, reply) => {
    const query = approvedQuery.safeParse(request.query);
    if (!query.success) throw bad("Invalid search.");
    const cities = await review().searchApproved(query.data.q ?? "", query.data.exclude ?? null);
    return reply.code(200).send({ cities });
  });

  app.get("/v1/admin/cities/history", admin, async (request, reply) => {
    const query = historyQuery.safeParse(request.query);
    if (!query.success) throw bad("Invalid history query.");
    const history = await review().reviewHistory(null, query.data.limit);
    return reply.code(200).send({ history });
  });

  app.get("/v1/admin/cities/:placeId/history", admin, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) throw new AppError(404, "CITY_NOT_FOUND", "City not found.");
    const history = await review().reviewHistory(params.data.placeId, 50);
    return reply.code(200).send({ history });
  });

  app.post("/v1/admin/cities/:placeId/approve", admin, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = approveBody.safeParse(request.body ?? undefined);
    if (!params.success) throw new AppError(404, "CITY_NOT_FOUND", "City not found.");
    if (!body.success) throw bad("Invalid approve payload.");
    const city = await review().approve(request.actor.personId, params.data.placeId, body.data?.cityLabel ?? null);
    return reply.code(200).send({ city });
  });

  app.post("/v1/admin/cities/:placeId/reject", admin, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = rejectBody.safeParse(request.body);
    if (!params.success) throw new AppError(404, "CITY_NOT_FOUND", "City not found.");
    if (!body.success) throw new AppError(400, "CITY_REJECT_REASON_REQUIRED", "Give a reason.");
    await review().reject(request.actor.personId, params.data.placeId, body.data.reason);
    return reply.code(204).send();
  });

  app.post("/v1/admin/cities/:placeId/reopen", admin, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) throw new AppError(404, "CITY_NOT_FOUND", "City not found.");
    await review().reopen(request.actor.personId, params.data.placeId);
    return reply.code(204).send();
  });

  app.post("/v1/admin/cities/:placeId/same-as", admin, async (request, reply) => {
    const params = idParams.safeParse(request.params);
    const body = sameAsBody.safeParse(request.body);
    if (!params.success) throw new AppError(404, "CITY_NOT_FOUND", "City not found.");
    if (!body.success) throw bad("Pick a city.");
    const result = await review().sameAs(request.actor.personId, params.data.placeId, body.data.targetPlaceId);
    return reply.code(200).send(result);
  });
};
