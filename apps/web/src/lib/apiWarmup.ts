import { API_BASE_URL } from "../api/client";

let warmed = false;

/**
 * Fire-and-forget request so a sleeping API host starts waking while the user types.
 * No UI, no retries, no cookies. In production `/v1/*` is proxied to the API host, and
 * any `/v1` request reaches it, so we hit the health route there. Safe to call many times.
 */
export function warmUpApi(): void {
  if (warmed || typeof fetch !== "function") return;
  warmed = true;
  try {
    void fetch(`${API_BASE_URL}/v1/healthz`, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* ignore: warm-up is best effort */
  }
}

/** Test helper. */
export function resetApiWarmupForTests(): void {
  warmed = false;
}
