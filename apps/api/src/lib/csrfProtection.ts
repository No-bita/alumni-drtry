import type { FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { AppError } from "./errors.js";

export const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const EXEMPT_CSRF_PATHS = new Set([
  "/v1/auth/start",
  "/v1/auth/verify",
  "/v1/auth/password-login",
  "/v1/auth/demo-login"
]);

export function parseOrigin(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "null") return null;
  try {
    return new URL(trimmed).origin.toLowerCase();
  } catch {
    return null;
  }
}

export function getAllowedOrigins(): Set<string> {
  const allowed = new Set<string>();
  if (env.CORS_ORIGIN) {
    const parts = env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      if (part === "*") continue; // Never trust "*" for cookie requests
      const parsed = parseOrigin(part);
      if (parsed) {
        allowed.add(parsed);
      } else {
        allowed.add(part.toLowerCase());
      }
    }
  }

  // Include APP_BASE_URL origin
  const appBase = parseOrigin(env.APP_BASE_URL);
  if (appBase) allowed.add(appBase);

  // Include MAGIC_LINK_BASE_URL origin if configured
  if (env.MAGIC_LINK_BASE_URL) {
    const magicBase = parseOrigin(env.MAGIC_LINK_BASE_URL);
    if (magicBase) allowed.add(magicBase);
  }

  return allowed;
}

export function verifyCsrfOrigin(request: FastifyRequest): void {
  if (!STATE_CHANGING_METHODS.has(request.method)) {
    return;
  }

  const pathname = (request.routeOptions?.url ?? request.url).split("?")[0];
  if (pathname && EXEMPT_CSRF_PATHS.has(pathname)) {
    return;
  }

  const sessionCookie = request.cookies?.[env.SESSION_COOKIE_NAME];
  if (!sessionCookie || typeof sessionCookie !== "string" || sessionCookie.length === 0) {
    return;
  }

  const originHeader = request.headers.origin as string | undefined;
  const refererHeader = (request.headers.referer ?? request.headers.referrer) as string | undefined;

  const requestOrigin = parseOrigin(originHeader) ?? parseOrigin(refererHeader);

  if (requestOrigin) {
    const allowed = getAllowedOrigins();
    if (!allowed.has(requestOrigin)) {
      throw new AppError(403, "CSRF_FORBIDDEN", "Cross-origin request forbidden.");
    }
  } else {
    // Neither Origin nor Referer provided
    if (env.NODE_ENV === "production") {
      throw new AppError(403, "CSRF_FORBIDDEN", "Missing Origin or Referer header.");
    }
  }
}

/**
 * Sign-in verification (GET and POST /v1/auth/verify) sets a session cookie, so a hostile page could
 * otherwise sign a visitor into the attacker's account ("login CSRF"), e.g. with an <img> pointing at
 * the GET link. Allow it only from our own pages: an allowed Origin or Referer, or a browser-stated
 * same-origin / same-site fetch (Sec-Fetch-Site). Enforced in production; elsewhere it only rejects an
 * explicitly foreign origin, so local tools and tests keep working.
 */
export function assertSameSiteAuthRequest(request: FastifyRequest, nodeEnv: string = env.NODE_ENV): void {
  const fetchSite = String(request.headers["sec-fetch-site"] ?? "").toLowerCase();
  const origin =
    parseOrigin(request.headers.origin as string | undefined) ??
    parseOrigin((request.headers.referer ?? request.headers.referrer) as string | undefined);

  if (origin) {
    if (getAllowedOrigins().has(origin)) return;
    throw new AppError(403, "CSRF_FORBIDDEN", "Sign-in links only work from the Alma Mater website.");
  }
  if (fetchSite === "same-origin" || fetchSite === "same-site") return;
  if (fetchSite === "cross-site") {
    throw new AppError(403, "CSRF_FORBIDDEN", "Sign-in links only work from the Alma Mater website.");
  }
  if (nodeEnv === "production") {
    throw new AppError(403, "CSRF_FORBIDDEN", "Missing Origin or Referer header.");
  }
}
