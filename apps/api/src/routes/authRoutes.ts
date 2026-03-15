import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { AppError, isAppError } from "../lib/errors.js";

const startAuthBodySchema = z.object({
  institutionalEmail: z.string().email()
});

const verifyAuthBodySchema = z
  .object({
    challengeId: z.string().uuid(),
    otp: z.string().min(4).max(12).optional(),
    magicLinkToken: z.string().min(16).max(256).optional()
  })
  .superRefine((value, ctx) => {
    const hasOtp = typeof value.otp === "string" && value.otp.length > 0;
    const hasMagic = typeof value.magicLinkToken === "string" && value.magicLinkToken.length > 0;
    if ((hasOtp && hasMagic) || (!hasOtp && !hasMagic)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one credential: otp or magicLinkToken."
      });
    }
  });

const verifyAuthQuerySchema = z.object({
  challengeId: z.string().uuid(),
  magicLinkToken: z.string().min(16).max(256)
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/auth/start", async (request, reply) => {
    const parsed = startAuthBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, "AUTH_BAD_REQUEST", "Invalid auth start payload.");
    }

    try {
      const result = await app.authService.startAuth({
        institutionalEmail: parsed.data.institutionalEmail,
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null
      });
      return reply.code(200).send(result);
    } catch (err) {
      if (isAppError(err) && err.statusCode === 429 && err.retryAfterSeconds != null) {
        return reply
          .code(429)
          .header("Retry-After", String(err.retryAfterSeconds))
          .send({ code: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.post("/v1/auth/verify", async (request, reply) => {
    const parsed = verifyAuthBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, "AUTH_BAD_REQUEST", "Invalid auth verification payload.");
    }

    const verificationPayload = {
      challengeId: parsed.data.challengeId,
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
      ...(parsed.data.otp
        ? { otp: parsed.data.otp }
        : { magicLinkToken: parsed.data.magicLinkToken! })
    };

    const result = await app.authService.verifyAuth(verificationPayload);

    reply.setCookie(env.SESSION_COOKIE_NAME, result.sessionToken, {
      path: "/",
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: env.SESSION_TTL_HOURS * 60 * 60,
      ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {})
    });

    return reply.code(200).send({
      person: result.person,
      sessionExpiresAt: result.sessionExpiresAt.toISOString()
    });
  });

  app.get("/v1/auth/verify", async (request, reply) => {
    const parsed = verifyAuthQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new AppError(400, "AUTH_BAD_REQUEST", "Invalid magic link parameters.");
    }

    const result = await app.authService.verifyAuth({
      challengeId: parsed.data.challengeId,
      magicLinkToken: parsed.data.magicLinkToken,
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null
    });

    reply.setCookie(env.SESSION_COOKIE_NAME, result.sessionToken, {
      path: "/",
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: env.SESSION_TTL_HOURS * 60 * 60,
      ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {})
    });

    return reply.code(200).send({
      person: result.person,
      sessionExpiresAt: result.sessionExpiresAt.toISOString()
    });
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    const token = request.cookies[env.SESSION_COOKIE_NAME];
    if (typeof token === "string" && token.length > 0) {
      await app.authService.logout(token);
    }

    reply.clearCookie(env.SESSION_COOKIE_NAME, {
      path: "/",
      ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {})
    });
    return reply.code(204).send();
  });
};
