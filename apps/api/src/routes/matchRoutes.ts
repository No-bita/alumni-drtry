import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { assertDiscoveryReadAllowed } from "../lib/directoryAbuseLimiter.js";
import { AppError } from "../lib/errors.js";
import { MATCH_CATEGORIES } from "../lib/matchIntent.js";

/** Postgres text cannot hold NUL; strip control characters before anything else. */
const stripControl = (v: string) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

const overrideText = z.string().max(120).transform(stripControl).nullable().optional();

const matchBodySchema = z.object({
  question: z.string().transform(stripControl).pipe(z.string().trim().min(3).max(500)),
  overrides: z
    .object({
      category: z.enum(MATCH_CATEGORIES).nullable().optional(),
      company: overrideText,
      role: overrideText,
      city: overrideText,
      country: overrideText
    })
    .strict()
    .optional()
});

export const matchRoutes: FastifyPluginAsync = async (app) => {
  /** Ask → Match: plain-language question in, up to 5 alumni with a factual "why them" out. */
  app.post("/v1/match", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = matchBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, "MATCH_BAD_REQUEST", "Write a question between 3 and 500 characters.");
    }

    // Same budget as directory reads: matching exposes directory rows.
    assertDiscoveryReadAllowed(request.actor.personId, request.ip);

    // Drop keys the client did not send so "absent" keeps the parsed value.
    const overrides = parsed.data.overrides
      ? Object.fromEntries(Object.entries(parsed.data.overrides).filter(([, v]) => v !== undefined))
      : undefined;

    const result = await app.matchService.match({
      question: parsed.data.question,
      overrides,
      viewerPersonId: request.actor.personId,
      viewerIsDemo: Boolean(request.actor.isDemo)
    });
    return reply.code(200).send(result);
  });
};
