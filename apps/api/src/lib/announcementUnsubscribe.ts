import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

/**
 * Unsubscribe tokens for announcement emails: "<personId>.<signature>", signed with a key derived
 * from AUTH_SECRET_PEPPER (no new secret). The purpose string keeps the signature useless anywhere else.
 * Tokens don't expire: an unsubscribe link in an old email should keep working.
 */
const PURPOSE = "announcement-unsubscribe:v1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signature(personId: string, secret: string): string {
  const key = createHmac("sha256", secret).update(PURPOSE).digest();
  return createHmac("sha256", key).update(personId.toLowerCase()).digest("base64url");
}

export function createUnsubscribeToken(personId: string, secret: string = env.AUTH_SECRET_PEPPER): string {
  return `${personId.toLowerCase()}.${signature(personId, secret)}`;
}

/** The person id the token was made for, or null when it is malformed or tampered with. */
export function verifyUnsubscribeToken(token: string, secret: string = env.AUTH_SECRET_PEPPER): string | null {
  if (typeof token !== "string" || token.length > 200) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const personId = token.slice(0, dot);
  const given = token.slice(dot + 1);
  if (!UUID_RE.test(personId)) return null;
  const expected = signature(personId, secret);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return personId.toLowerCase();
}
