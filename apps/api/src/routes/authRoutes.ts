import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { generateOpaqueToken } from "../lib/crypto.js";
import { buildGoogleAuthorizationUrl } from "../lib/googleOAuth.js";
import { AppError, isAppError } from "../lib/errors.js";

const GOOGLE_STATE_COOKIE = "google_oauth_state";
const GOOGLE_STATE_MAX_AGE_SEC = 600;

function sessionSameSite(): "none" | "lax" {
  // Production deployments commonly host web + API on different domains
  // (e.g. Vercel + Railway), which requires SameSite=None for cookie-based auth.
  return env.NODE_ENV === "production" ? "none" : "lax";
}

function webAppBaseUrl(): string {
  return (env.MAGIC_LINK_BASE_URL ?? env.APP_BASE_URL).replace(/\/+$/, "");
}

function apiBaseUrl(): string {
  return env.APP_BASE_URL.replace(/\/+$/, "");
}

function googleOAuthRedirectUri(): string {
  return `${apiBaseUrl()}/v1/auth/google/callback`;
}

function isGoogleOAuthConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

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
  app.get("/v1/auth/google/config", async (_request, reply) => {
    return reply.code(200).send({
      enabled: isGoogleOAuthConfigured(),
      ...(env.GOOGLE_OAUTH_HOSTED_DOMAIN
        ? { googleHostedDomainHint: env.GOOGLE_OAUTH_HOSTED_DOMAIN }
        : {})
    });
  });

  app.get("/v1/auth/google", async (request, reply) => {
    if (!isGoogleOAuthConfigured()) {
      throw new AppError(503, "AUTH_GOOGLE_DISABLED", "Google sign-in is not configured.");
    }
    const state = generateOpaqueToken(24);
    reply.setCookie(GOOGLE_STATE_COOKIE, state, {
      path: "/",
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: GOOGLE_STATE_MAX_AGE_SEC,
      ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {})
    });
    const url = buildGoogleAuthorizationUrl({
      clientId: env.GOOGLE_CLIENT_ID!,
      redirectUri: googleOAuthRedirectUri(),
      state,
      ...(env.GOOGLE_OAUTH_HOSTED_DOMAIN
        ? { hostedDomain: env.GOOGLE_OAUTH_HOSTED_DOMAIN }
        : {})
    });
    return reply.redirect(url);
  });

  app.get("/v1/auth/google/callback", async (request, reply) => {
    const webBase = webAppBaseUrl();
    const clearStateCookie = () => {
      reply.clearCookie(GOOGLE_STATE_COOKIE, {
        path: "/",
        ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {})
      });
    };

    const q = request.query as Record<string, unknown>;
    const oauthError = typeof q.error === "string" && q.error.length > 0 ? q.error : null;
    if (oauthError) {
      clearStateCookie();
      const hint = oauthError === "access_denied" ? "cancelled" : oauthError;
      return reply.redirect(`${webBase}/login?error=${encodeURIComponent(hint)}`);
    }

    const code = typeof q.code === "string" ? q.code : "";
    const state = typeof q.state === "string" ? q.state : "";
    if (!code || !state) {
      clearStateCookie();
      return reply.redirect(`${webBase}/login?error=google_invalid`);
    }

    const cookieState = request.cookies[GOOGLE_STATE_COOKIE];
    if (!cookieState || cookieState !== state) {
      clearStateCookie();
      return reply.redirect(`${webBase}/login?error=google_state`);
    }
    clearStateCookie();

    if (!isGoogleOAuthConfigured()) {
      return reply.redirect(`${webBase}/login?error=google_failed`);
    }

    try {
      const result = await app.authService.signInWithGoogle({
        code,
        redirectUri: googleOAuthRedirectUri(),
        ipAddress: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null
      });

      reply.setCookie(env.SESSION_COOKIE_NAME, result.sessionToken, {
        path: "/",
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: sessionSameSite(),
        maxAge: env.SESSION_HARD_CAP_HOURS * 60 * 60,
        ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {})
      });

      return reply.redirect(`${webBase}/login?google=1`);
    } catch (err) {
      if (isAppError(err)) {
        const query =
          err.code === "AUTH_DOMAIN_NOT_ALLOWED"
            ? "google_domain"
            : err.code === "AUTH_GOOGLE_EMAIL_UNVERIFIED"
              ? "google_unverified"
              : "google_failed";
        return reply.redirect(`${webBase}/login?error=${encodeURIComponent(query)}`);
      }
      throw err;
    }
  });

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
      sameSite: sessionSameSite(),
      maxAge: env.SESSION_HARD_CAP_HOURS * 60 * 60,
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
      sameSite: sessionSameSite(),
      maxAge: env.SESSION_HARD_CAP_HOURS * 60 * 60,
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
