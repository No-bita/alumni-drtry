import { ApiRequestError } from "./apiRequestError";
import { assertApiGet } from "./assertApiGet";

/** GET /v1/admin/metrics/discovery-limits: counts only, no names. */
export type BrowsingLimits = { cap: number; nearLimit: number; atLimit: number; day: string };

export const browsingLimitsQueryKey = ["admin", "discovery-limits"] as const;

export async function fetchBrowsingLimits(signal: AbortSignal): Promise<BrowsingLimits> {
  return (await assertApiGet<{ limits: BrowsingLimits }>("/v1/admin/metrics/discovery-limits", signal)).limits;
}

/** API codes for the anti-scraping limits (HTTP 429). */
export const BROWSING_LIMIT_CODES = new Set(["DISCOVERY_DAILY_LIMIT", "DISCOVERY_RATE_LIMITED"]);

/** Fallback wording if the server message is missing. */
export const BROWSING_DAILY_MESSAGE = "You've looked at a lot of profiles today. Try again tomorrow.";
export const BROWSING_BURST_MESSAGE = "You're browsing quickly. Try again in a moment.";

/** The member-facing message for a browsing-limit error code, or null for any other error. */
export function browsingLimitMessage(code: string | null | undefined, message?: string | null): string | null {
  if (!code || !BROWSING_LIMIT_CODES.has(code)) return null;
  if (message?.trim()) return message;
  return code === "DISCOVERY_DAILY_LIMIT" ? BROWSING_DAILY_MESSAGE : BROWSING_BURST_MESSAGE;
}

/** The browsing-limit message for a thrown query error, or null when it's some other failure. */
export function browsingLimitFromError(err: unknown): string | null {
  if (err instanceof ApiRequestError) return browsingLimitMessage(err.code, err.message);
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? browsingLimitMessage(code, (err as Error).message) : null;
}
