import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * TRUST_PROXY -> Fastify `trustProxy`. Unset: 2 hops in production (browser -> Vercel rewrite ->
 * Render's proxy -> API), nothing elsewhere. A number trusts that many hops; "true" trusts every hop
 * (only safe when nothing can reach the API directly); a comma list trusts those IPs/CIDRs.
 */
export type TrustProxySetting = boolean | string[] | ((address: string, hop: number) => boolean);

export function resolveTrustProxy(raw: string | undefined, nodeEnv: string): TrustProxySetting {
  const value = raw?.trim();
  if (!value) return nodeEnv === "production" ? trustHops(2) : false;
  if (value === "false" || value === "0") return false;
  if (value === "true") return true;
  if (/^\d+$/.test(value)) return trustHops(Number(value));
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Trust the nearest `hops` proxies (the socket peer is hop 0). This Fastify version treats a bare number
 * as "trust nothing", so hop counting is a function. Note: a client that reaches the API directly
 * (skipping Vercel) can put a fake address into X-Forwarded-For; only per-IP limits rely on it, the
 * per-member limits don't.
 */
export function trustHops(hops: number): (address: string, hop: number) => boolean {
  return (_address, hop) => hop < hops;
}

/** The path without its query string: what we log, and what we send to Sentry. */
export function pathOnly(url: string | undefined): string {
  if (!url) return "";
  const i = url.indexOf("?");
  return i === -1 ? url : url.slice(0, i);
}

/**
 * Request log line: method, path (never the query string: magic-link tokens, search terms and
 * emails travel there), client IP and request id. No headers, no body.
 */
export function requestLogSerializer(request: FastifyRequest): Record<string, unknown> {
  return {
    method: request.method,
    url: pathOnly(request.url),
    remoteAddress: request.ip
  };
}

/** Field names censored anywhere they appear in a log object (one level deep, plus nested req/res). */
export const LOG_REDACT_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  "headers.cookie",
  "headers.authorization",
  "email",
  "institutionalEmail",
  "personalEmail",
  "token",
  "magicLinkToken",
  "otp",
  "q",
  "*.email",
  "*.institutionalEmail",
  "*.personalEmail",
  "*.token",
  "*.magicLinkToken",
  "*.otp",
  "*.q"
];

/**
 * Security headers for a JSON API: no sniffing, never framed, no referrer, nothing loaded by a
 * browser if a response is ever rendered, and HSTS in production.
 */
export function applySecurityHeaders(reply: FastifyReply, nodeEnv: string): void {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header("Cross-Origin-Opener-Policy", "same-origin");
  if (nodeEnv === "production") {
    reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}
