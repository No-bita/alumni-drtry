import type { FastifyReply } from "fastify";
import { env } from "../config/env.js";
import { normalizeEmail } from "./domainAllowlist.js";
import { sessionSameSite } from "./sessionCookie.js";

/**
 * Admin "view as member" (testing only). Separate from the admin's own session: a short-lived token in
 * its own cookie says which member the admin is looking at. Read-only: while it is active every
 * state-changing request is refused, except ending it.
 */
export const VIEW_AS_COOKIE_NAME = "alumni_view_as";
export const VIEW_AS_END_PATH = "/v1/admin/view-as/end";

export const VIEW_AS_READ_ONLY_CODE = "VIEW_AS_READ_ONLY";
export const VIEW_AS_READ_ONLY_MESSAGE =
  "You're viewing as a member (read-only). Exit view-as to make changes.";

/** Allowlist from a comma-separated string: trimmed, lowercased, empties dropped. */
export function parseViewAsAllowlist(raw: string | undefined | null): ReadonlySet<string> {
  return new Set(
    String(raw ?? "")
      .split(",")
      .map((s) => normalizeEmail(s))
      .filter((s) => s.length > 0 && s.includes("@"))
  );
}

function cookieBase() {
  return {
    path: "/",
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: sessionSameSite(),
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {})
  };
}

export function setViewAsCookie(reply: FastifyReply, token: string, ttlMinutes: number): void {
  reply.setCookie(VIEW_AS_COOKIE_NAME, token, { ...cookieBase(), maxAge: ttlMinutes * 60 });
}

export function clearViewAsCookie(reply: FastifyReply): void {
  reply.clearCookie(VIEW_AS_COOKIE_NAME, cookieBase());
}

export type PersonRole = "alumni" | "admin" | "super_admin";

const ROLE_RANK: Record<PersonRole, number> = { alumni: 0, admin: 1, super_admin: 2 };

/** While viewing as someone, never hold more access than the real admin has. */
export function cappedRole(target: PersonRole, real: PersonRole): PersonRole {
  return ROLE_RANK[target] <= ROLE_RANK[real] ? target : real;
}
