import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { assertDiscoveryReadAllowed } from "../lib/directoryAbuseLimiter.js";
import { AppError } from "../lib/errors.js";
import { HELP_KINDS, OFFER_LINE_MAX } from "../services/citiesService.js";

/** Postgres text cannot hold NUL; strip control characters before anything else. */
const stripControl = (v: string) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

const placeParams = z.object({ placeId: z.string().uuid() });
const arrivalParams = z.object({ arrivalId: z.string().uuid() });
const offerParams = z.object({ offerId: z.string().uuid() });

const alumniQuery = z.object({
  filter: z.enum(["batch", "department", "company", "coffee"]).default("batch"),
  cursor: z
    .string()
    .regex(/^\d{1,6}$/)
    .optional()
});

const searchQuery = z.object({
  q: z.string().transform(stripControl).pipe(z.string().trim().min(1).max(80))
});

const optInBody = z.object({ placeId: z.string().uuid() });

const offerBody = z.object({
  kinds: z.array(z.enum(HELP_KINDS)).min(1).max(HELP_KINDS.length),
  line: z.string().transform(stripControl).pipe(z.string().max(OFFER_LINE_MAX)).nullable().optional()
});

const viewerOf = (request: { actor: { personId: string; isDemo?: boolean } }) => ({
  personId: request.actor.personId,
  isDemo: Boolean(request.actor.isDemo)
});

/** Cities v1 (SPEC: cities-v1-handoff). Every one-to-one path still goes through POST /v1/contact-requests. */
export const citiesRoutes: FastifyPluginAsync = async (app) => {
  /** City switcher and the viewer's own city. */
  app.get("/v1/cities", { preHandler: app.authenticate }, async (request, reply) => {
    return reply.code(200).send(await app.citiesService.listCities(viewerOf(request)));
  });

  /** "Where do you live?": canonical places by name or a known spelling. */
  app.get("/v1/cities/search", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = searchQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(200).send({ places: [] });
    return reply.code(200).send(await app.citiesService.searchPlaces(parsed.data.q));
  });

  /** Everything for one city page, shaped by who is looking (local, newcomer, arriver, no city). */
  app.get("/v1/cities/:placeId", { preHandler: app.authenticate }, async (request, reply) => {
    const params = placeParams.safeParse(request.params);
    if (!params.success) throw new AppError(404, "CITY_NOT_FOUND", "City not found.");
    // Lists directory rows: same budget as directory reads.
    assertDiscoveryReadAllowed(request.actor.personId, request.ip);
    return reply.code(200).send(await app.citiesService.city(params.data.placeId, viewerOf(request)));
  });

  app.get("/v1/cities/:placeId/alumni", { preHandler: app.authenticate }, async (request, reply) => {
    const params = placeParams.safeParse(request.params);
    const query = alumniQuery.safeParse(request.query);
    if (!params.success) throw new AppError(404, "CITY_NOT_FOUND", "City not found.");
    if (!query.success) throw new AppError(400, "CITIES_BAD_REQUEST", "Invalid alumni filter.");
    assertDiscoveryReadAllowed(request.actor.personId, request.ip);
    const offset = query.data.cursor ? Number(query.data.cursor) : 0;
    return reply
      .code(200)
      .send(await app.citiesService.alumni(params.data.placeId, viewerOf(request), query.data.filter, offset));
  });

  const mutation = { preHandler: [app.authenticate, app.requireNonDemoMutation] };

  /** "Yes, show me as new in town." */
  app.post("/v1/cities/arrivals", mutation, async (request, reply) => {
    const body = optInBody.safeParse(request.body);
    if (!body.success) throw new AppError(400, "CITIES_BAD_REQUEST", "Invalid city.");
    const arrival = await app.citiesService.optIn(request.actor.personId, body.data.placeId);
    return reply.code(201).send({ arrival });
  });

  /** "Stop showing me as new." Offers already received stay visible to the newcomer. */
  app.post("/v1/cities/arrivals/end", mutation, async (request, reply) => {
    await app.citiesService.endArrival(request.actor.personId);
    return reply.code(204).send();
  });

  /** A local offers help. Not a message: only the newcomer (who opted in) sees it, in the app. */
  app.post("/v1/cities/arrivals/:arrivalId/offers", mutation, async (request, reply) => {
    const params = arrivalParams.safeParse(request.params);
    const body = offerBody.safeParse(request.body);
    if (!params.success) throw new AppError(404, "OFFER_NOT_FOUND", "They're no longer shown as new in town.");
    if (!body.success) throw new AppError(400, "CITIES_BAD_REQUEST", "Pick at least one thing you can help with.");
    const offer = await app.citiesService.offer(
      request.actor.personId,
      params.data.arrivalId,
      body.data.kinds,
      body.data.line ?? null
    );
    return reply.code(201).send({ offer });
  });

  app.delete("/v1/cities/offers/:offerId", mutation, async (request, reply) => {
    const params = offerParams.safeParse(request.params);
    if (!params.success) throw new AppError(404, "OFFER_NOT_FOUND", "Offer not found.");
    await app.citiesService.withdrawOffer(request.actor.personId, params.data.offerId);
    return reply.code(204).send();
  });

  app.post("/v1/cities/offers/seen", mutation, async (request, reply) => {
    await app.citiesService.markOffersSeen(request.actor.personId);
    return reply.code(204).send();
  });
};
