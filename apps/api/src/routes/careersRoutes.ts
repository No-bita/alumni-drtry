import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { assertDiscoveryReadAllowed } from "../lib/directoryAbuseLimiter.js";
import { AppError } from "../lib/errors.js";

/** Postgres text cannot hold NUL; strip control characters before anything else. */
const stripControl = (v: string) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

const companyQuerySchema = z.object({
  name: z.string().transform(stripControl).pipe(z.string().trim().min(2).max(120)),
  role: z.string().transform(stripControl).pipe(z.string().trim().max(120)).optional()
});

export const careersRoutes: FastifyPluginAsync = async (app) => {
  /** Company screen: people there now and before, with "open to referrals" and your note status. */
  app.get("/v1/careers/company", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = companyQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError(400, "CAREERS_BAD_REQUEST", "Type a company name (2 to 120 characters).");
    }
    // Same budget as directory reads: this lists directory rows.
    assertDiscoveryReadAllowed(request.actor.personId, request.ip);
    const result = await app.careersService.company({
      name: parsed.data.name,
      role: parsed.data.role ? parsed.data.role : null,
      viewerPersonId: request.actor.personId,
      viewerIsDemo: Boolean(request.actor.isDemo)
    });
    return reply.code(200).send(result);
  });

  /** "Companies you can get referred to": alumni working there now who are open to referrals. */
  app.get("/v1/careers/referral-companies", { preHandler: app.authenticate }, async (request, reply) => {
    const companies = await app.careersService.referralCompanies(request.actor.personId, Boolean(request.actor.isDemo));
    return reply.code(200).send({ companies });
  });

  /** "People asked about your company": asks naming your current company lately (null without one). */
  app.get("/v1/careers/my-company-demand", { preHandler: app.authenticate }, async (request, reply) => {
    const demand = await app.careersService.myCompanyDemand(request.actor.personId);
    return reply.code(200).send({ demand });
  });
};
