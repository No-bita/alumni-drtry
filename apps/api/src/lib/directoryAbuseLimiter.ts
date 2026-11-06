import type { Pool } from "pg";
import { env } from "../config/env.js";
import { AppError } from "./errors.js";
import { captureMessage } from "./sentry.js";

type HitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

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

/** Burst: too many reads this minute. */
export const DISCOVERY_RATE_LIMITED = "DISCOVERY_RATE_LIMITED";
/** Daily cap reached. */
export const DISCOVERY_DAILY_LIMIT = "DISCOVERY_DAILY_LIMIT";

export const DISCOVERY_BURST_MESSAGE = "You're browsing quickly. Try again in a moment.";
export const DISCOVERY_DAILY_MESSAGE = "You've looked at a lot of profiles today. Try again tomorrow.";

/**
 * Per-IP guard for a whole route family (in process memory; a second layer behind the per-member
 * limits in the database). Only meaningful when the real client IP is known (see TRUST_PROXY).
 */
export function assertIpAllowed(
  family: string,
  clientIp: string | null | undefined,
  max: number,
  windowMinutes: number,
  code = DISCOVERY_RATE_LIMITED,
  message = DISCOVERY_BURST_MESSAGE
): void {
  if (max <= 0 || !clientIp) return;
  const r = recordHit(ipHits, `${family}:${clientIp}`, windowMinutes * 60_000, max);
  if (!r.ok) {
    throw new AppError(429, code, message, true, r.retryAfterSeconds);
  }
}

/** Test helper: forget in-memory IP hits. */
export function resetIpHitsForTests(): void {
  ipHits.clear();
}

export type DiscoveryLimits = {
  /** Reads per member per UTC minute (0 = off). */
  perMinute: number;
  /** Reads per member per day in Asia/Kolkata (0 = off). */
  perDay: number;
  /** Reads per client IP per minute, in memory (0 = off). */
  perIpPerMinute: number;
};

export function discoveryLimitsFromEnv(): DiscoveryLimits {
  return {
    perMinute: env.DISCOVERY_READ_MAX_PER_USER_WINDOW,
    perDay: env.DISCOVERY_READ_MAX_PER_USER_DAY,
    perIpPerMinute: env.DISCOVERY_READ_MAX_PER_IP_WINDOW
  };
}

/** Share of the daily cap that counts as "near the limit" on the admin page. */
export const NEAR_LIMIT_SHARE = 0.8;

type Actor = { personId: string; role: string; isDemo?: boolean };

/**
 * Directory, profile and people-list reads ("discovery reads"), counted per member in the database
 * so the limits survive restarts and hold across API instances. One upsert per counted request.
 * Admins are not counted.
 */
export class DiscoveryReadLimiter {
  private readonly limits: DiscoveryLimits;

  constructor(
    private readonly pool: Pool,
    limits: Partial<DiscoveryLimits> = {}
  ) {
    this.limits = { ...discoveryLimitsFromEnv(), ...limits };
  }

  get dailyCap(): number {
    return this.limits.perDay;
  }

  async assert(actor: Actor, clientIp: string | null | undefined): Promise<void> {
    if (actor.role === "admin" || actor.role === "super_admin") return;

    assertIpAllowed("discovery", clientIp, this.limits.perIpPerMinute, 1);

    const { perMinute, perDay } = this.limits;
    if (perMinute <= 0 && perDay <= 0) return;

    // Both buckets in one statement: the day (00:00 Asia/Kolkata) and the current UTC minute.
    const result = await this.pool.query<{ bucket: "day" | "minute"; count: number; window_start: Date }>(
      `
      INSERT INTO discovery_read_counters (person_id, bucket, window_start, count)
      VALUES
        ($1, 'day', (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'), 1),
        ($1, 'minute', date_trunc('minute', now()), 1)
      ON CONFLICT (person_id, bucket, window_start)
      DO UPDATE SET count = discovery_read_counters.count + 1, updated_at = now()
      RETURNING bucket, count, window_start
      `,
      [actor.personId]
    );

    // Light housekeeping: about one request in 200 prunes old rows.
    if (Math.random() < 0.005) {
      void this.pool
        .query(
          `DELETE FROM discovery_read_counters
           WHERE (bucket = 'minute' AND window_start < now() - interval '1 hour')
              OR (bucket = 'day' AND window_start < now() - interval '35 days')`
        )
        .catch(() => undefined);
    }

    const day = result.rows.find((r) => r.bucket === "day");
    const minute = result.rows.find((r) => r.bucket === "minute");

    if (perDay > 0 && day && day.count > perDay) {
      if (day.count === perDay + 1) {
        // First request over the cap today: one warning, person id only (no PII).
        captureMessage("Discovery daily cap reached", { personId: actor.personId, cap: perDay });
      }
      const nextDay = new Date(day.window_start.getTime() + 24 * 60 * 60 * 1000);
      const retry = Math.max(60, Math.ceil((nextDay.getTime() - Date.now()) / 1000));
      throw new AppError(429, DISCOVERY_DAILY_LIMIT, DISCOVERY_DAILY_MESSAGE, true, retry);
    }
    if (perMinute > 0 && minute && minute.count > perMinute) {
      const retry = Math.max(1, Math.ceil((minute.window_start.getTime() + 60_000 - Date.now()) / 1000));
      throw new AppError(429, DISCOVERY_RATE_LIMITED, DISCOVERY_BURST_MESSAGE, true, retry);
    }
  }

  /** Admin page: members at or above 80% of today's cap (and at the cap), counts only. */
  async nearLimitToday(): Promise<{ cap: number; nearLimit: number; atLimit: number; day: string }> {
    const cap = this.limits.perDay;
    const r = await this.pool.query<{ near: string; at: string; day: string }>(
      `
      SELECT
        COUNT(*) FILTER (WHERE count >= $1)::text AS near,
        COUNT(*) FILTER (WHERE count >= $2)::text AS at,
        to_char(date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS day
      FROM discovery_read_counters
      WHERE bucket = 'day'
        AND window_start = (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')
      `,
      [cap > 0 ? Math.ceil(cap * NEAR_LIMIT_SHARE) : 2_147_483_647, cap > 0 ? cap : 2_147_483_647]
    );
    const row = r.rows[0];
    return {
      cap,
      nearLimit: Number(row?.near ?? 0),
      atLimit: Number(row?.at ?? 0),
      day: row?.day ?? ""
    };
  }
}
