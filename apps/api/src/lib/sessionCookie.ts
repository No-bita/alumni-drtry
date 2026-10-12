import type { FastifyReply } from "fastify";
import { env } from "../config/env.js";

export const GOOGLE_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_STATE_MAX_AGE_SEC = 600;

export function sessionSameSite(): "none" | "lax" {
  // Production deployments commonly host web + API on different domains
  // (e.g. Vercel + Railway), which requires SameSite=None for cookie-based auth.
  return env.NODE_ENV === "production" ? "none" : "lax";
}

export function getSessionCookieOptions() {
  return {
    path: "/",
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: sessionSameSite(),
    maxAge: env.SESSION_HARD_CAP_HOURS * 60 * 60,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {})
  };
}

export function setSessionCookie(reply: FastifyReply, sessionToken: string): void {
  reply.setCookie(env.SESSION_COOKIE_NAME, sessionToken, getSessionCookieOptions());
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(env.SESSION_COOKIE_NAME, {
    path: "/",
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {})
  });
}

export function setOAuthStateCookie(reply: FastifyReply, state: string): void {
  reply.setCookie(GOOGLE_STATE_COOKIE, state, {
    path: "/",
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: GOOGLE_STATE_MAX_AGE_SEC,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {})
  });
}
