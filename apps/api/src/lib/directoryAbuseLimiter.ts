import { env } from "../config/env.js";
import { AppError } from "./errors.js";

type HitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

const userHits = new Map<string, number[]>();
const ipHits = new Map<string, number[]>();

function recordHit(
  store: Map<string, number[]>,
  key: string,
  windowMs: number,
  max: number
): HitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  let hits = store.get(key) ?? [];
  hits = hits.filter((t) => t > cutoff);
  if (hits.length >= max) {
    hits.sort((a, b) => a - b);
    const oldest = hits[0]!;
    const retryMs = Math.max(0, oldest + windowMs - now);
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)) };
  }
  hits.push(now);
  if (hits.length > max * 3) {
    hits = hits.slice(-max * 2);
  }
  store.set(key, hits);
  return { ok: true };
}

/**
 * Limits combined reads: directory search, public profile, residence-cities aggregate.
 * In-memory per process (use a shared store like Redis if you scale horizontally).
 */
export function assertDiscoveryReadAllowed(viewerPersonId: string, clientIp: string | null | undefined): void {
  const windowMs = env.DISCOVERY_READ_WINDOW_MINUTES * 60_000;
  const maxUser = env.DISCOVERY_READ_MAX_PER_USER_WINDOW;
  if (maxUser > 0) {
    const r = recordHit(userHits, `u:${viewerPersonId}`, windowMs, maxUser);
    if (!r.ok) {
      throw new AppError(
        429,
        "DISCOVERY_RATE_LIMITED",
        "Too many directory requests. Try again in a moment.",
        true,
        r.retryAfterSeconds
      );
    }
  }

  const maxIp = env.DISCOVERY_READ_MAX_PER_IP_WINDOW;
  if (maxIp > 0 && clientIp && clientIp.length > 0) {
    const r = recordHit(ipHits, `i:${clientIp}`, windowMs, maxIp);
    if (!r.ok) {
      throw new AppError(
        429,
        "DISCOVERY_RATE_LIMITED",
        "Too many directory requests. Try again in a moment.",
        true,
        r.retryAfterSeconds
      );
    }
  }
}
