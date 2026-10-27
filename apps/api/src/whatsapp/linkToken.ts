import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

/**
 * Signed, short-lived token in the bot's website links. It proves which WhatsApp number the link
 * was sent to (WhatsApp already verified that number), so the website can link it to the member
 * after they sign in, without asking them to type it or sending a paid sign-in code.
 * Each token carries a random nonce: it can link a number once (the nonce is recorded on use).
 */
export const LINK_TTL_MS = 24 * 60 * 60 * 1000;

function key(): Buffer {
  // Derived from the existing server secret with a purpose label, so no new secret is needed.
  return createHmac("sha256", env.AUTH_SECRET_PEPPER).update("wa-link-token-v1").digest();
}

const b64 = (buf: Buffer) => buf.toString("base64url");

export type LinkToken = { waId: string; nonce: string };

export function signLinkToken(waId: string, now = Date.now()): string {
  const payload = b64(Buffer.from(JSON.stringify({ w: waId, e: now + LINK_TTL_MS, n: b64(randomBytes(12)) })));
  const sig = b64(createHmac("sha256", key()).update(payload).digest());
  return `${payload}.${sig}`;
}

/** The WhatsApp number (and the token's nonce) in a valid, unexpired token; null otherwise. */
export function verifyLinkToken(token: string, now = Date.now()): LinkToken | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", key()).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { w?: unknown; e?: unknown; n?: unknown };
    if (typeof data.w !== "string" || !/^[0-9]{8,15}$/.test(data.w)) return null;
    if (typeof data.e !== "number" || data.e < now) return null;
    if (typeof data.n !== "string" || !/^[A-Za-z0-9_-]{8,32}$/.test(data.n)) return null;
    return { waId: data.w, nonce: data.n };
  } catch {
    return null;
  }
}

/** Meta's X-Hub-Signature-256 header: "sha256=" + HMAC-SHA256(app secret, raw body). */
export function verifyWebhookSignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}
