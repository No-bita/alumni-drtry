import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";
import { EXPERIENCE_BANDS, JOB_FUNCTIONS } from "../lib/jobFunctions.js";
import { noteInputSchema } from "../lib/noteDetails.js";
import type { AskerRequestView, HelperAskView } from "../repos/brokerRepo.js";

const createSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("referral"),
    jobFunction: z.enum(JOB_FUNCTIONS),
    note: noteInputSchema
  }),
  // Hiring: from the poster's own Wall post (intentcastId), or private from Ask's Find candidates
  // (role, no post). Exactly one of the two.
  z.object({
    kind: z.literal("hiring"),
    intentcastId: z.string().uuid().optional(),
    role: z
      .object({
        jobFunction: z.enum(JOB_FUNCTIONS),
        experience: z.enum(EXPERIENCE_BANDS),
        roleTitle: z.string().trim().max(120).optional().nullable(),
        company: z.string().trim().max(120).optional().nullable(),
        message: z.string().trim().min(10).max(1500)
      })
      .strict()
      .optional()
  })
]);

const askParams = z.object({ id: z.string().uuid() });
const respondSchema = z.object({ action: z.enum(["accept", "decline"]) });
const referralEligibleQuery = z.object({ company: z.string().trim().min(1).max(120) });
const hiringEligibleQuery = z.object({ jobFunction: z.enum(JOB_FUNCTIONS), experience: z.enum(EXPERIENCE_BANDS) });
const whatsappSettingSchema = z.object({ enabled: z.boolean() });

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function requestDto(r: AskerRequestView) {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    firstSeenAt: iso(r.firstSeenAt),
    connectedAt: iso(r.connectedAt),
    expiredAt: iso(r.expiredAt)
  };
}

function askDto(a: HelperAskView) {
  return { ...a, askedAt: a.askedAt.toISOString(), expiresAt: a.expiresAt.toISOString(), seenAt: iso(a.seenAt) };
}

/**
 * Brokered requests: referral (always) and hiring (optional). The asker never learns who was asked or
 * who said no; helpers answer Yes / Not this time; the first yes connects (an accepted reachout).
 */
export const brokerRoutes: FastifyPluginAsync = async (app) => {
  const isDemo = (request: { actor: { isDemo?: boolean } }) => Boolean(request.actor.isDemo);

  /** Company suggestions for the referral flow, with how many alumni work there now. */
  app.get("/v1/broker-requests/referral-companies", { preHandler: app.authenticate }, async (request, reply) => {
    const companies = await app.brokerService.referralCompanies(request.actor.personId, isDemo(request));
    return reply.code(200).send({ companies });
  });

  /** Told before sending: how many alumni at this company would be asked. */
  app.get("/v1/broker-requests/referral-eligible", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = referralEligibleQuery.safeParse(request.query);
    if (!parsed.success) throw new AppError(400, "BROKER_BAD_REQUEST", "Add a company.");
    return reply.code(200).send(await app.brokerService.referralEligible(request.actor.personId, isDemo(request), parsed.data.company));
  });

  /** For the hiring composer's "Also ask matching alumni privately". */
  app.get("/v1/broker-requests/hiring-eligible", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = hiringEligibleQuery.safeParse(request.query);
    if (!parsed.success) throw new AppError(400, "BROKER_BAD_REQUEST", "Pick a function and experience.");
    return reply
      .code(200)
      .send(await app.brokerService.hiringEligible(request.actor.personId, isDemo(request), parsed.data.jobFunction, parsed.data.experience));
  });

  /** The viewer's own requests, with progress (never who was asked). */
  app.get("/v1/broker-requests", { preHandler: app.authenticate }, async (request, reply) => {
    const requests = await app.brokerService.listMine(request.actor.personId);
    return reply.code(200).send({ requests: requests.map(requestDto) });
  });

  app.post(
    "/v1/broker-requests",
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
    async (request, reply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) throw new AppError(400, "BROKER_BAD_REQUEST", "Invalid request.");
      const body = parsed.data;
      if (body.kind === "hiring" && Boolean(body.intentcastId) === Boolean(body.role)) {
        throw new AppError(400, "BROKER_BAD_REQUEST", "Send either the hiring post or the role.");
      }
      const created =
        body.kind === "referral"
          ? await app.brokerService.createReferralRequest(request.actor.personId, isDemo(request), {
              jobFunction: body.jobFunction,
              note: body.note
            })
          : body.role
            ? await app.brokerService.createPrivateHiringRequest(request.actor.personId, isDemo(request), {
                jobFunction: body.role.jobFunction,
                experience: body.role.experience,
                roleTitle: body.role.roleTitle ?? null,
                company: body.role.company ?? null,
                message: body.role.message
              })
            : await app.brokerService.createHiringRequest(request.actor.personId, isDemo(request), body.intentcastId!);
      return reply.code(201).send({ request: requestDto(created) });
    }
  );

  /** Asks waiting for the viewer's answer, and the ones they said yes to (with the asker's contact). */
  app.get("/v1/broker-asks", { preHandler: app.authenticate }, async (request, reply) => {
    const asks = await app.brokerService.listForHelper(request.actor.personId);
    return reply.code(200).send({ asks: asks.map(askDto) });
  });

  app.post("/v1/broker-asks/:id/seen", { preHandler: app.authenticate }, async (request, reply) => {
    const params = askParams.safeParse(request.params);
    if (!params.success) throw new AppError(400, "BROKER_BAD_REQUEST", "Invalid request id.");
    await app.brokerService.markSeen(request.actor.personId, params.data.id);
    return reply.code(204).send();
  });

  app.post(
    "/v1/broker-asks/:id/respond",
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
    async (request, reply) => {
      const params = askParams.safeParse(request.params);
      const body = respondSchema.safeParse(request.body);
      if (!params.success || !body.success) throw new AppError(400, "BROKER_BAD_REQUEST", "Invalid answer.");
      const result = await app.brokerService.respond(request.actor.personId, params.data.id, body.data.action);
      return reply.code(200).send(result);
    }
  );

  /** Admin switch: also send brokered asks on WhatsApp (off by default). */
  app.get("/v1/admin/settings/broker-whatsapp", { preHandler: [app.authenticate, app.requireAdmin] }, async (_request, reply) => {
    return reply.code(200).send({ enabled: await app.brokerService.whatsappEnabled() });
  });

  app.put("/v1/admin/settings/broker-whatsapp", { preHandler: [app.authenticate, app.requireAdmin] }, async (request, reply) => {
    const parsed = whatsappSettingSchema.safeParse(request.body);
    if (!parsed.success) throw new AppError(400, "BROKER_BAD_REQUEST", "Send enabled: true or false.");
    const enabled = await app.brokerService.setWhatsappEnabled(parsed.data.enabled, request.actor.personId);
    return reply.code(200).send({ enabled });
  });
};
