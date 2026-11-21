import { rateLimitedFetch } from "./apiRateLimit";
import { API_BASE_URL } from "../api/client";

let warmed = false;
const WARMUP_STORAGE_KEY = "alma-api-warmup-v1";
const WARMUP_WINDOW_MS = 10 * 60_000;

/** Timestamp-only wire format shared with the landing page, scoped to the same tab/origin. */
function claimWarmup(): boolean {
  try {
    const now = Date.now();
    const last = Number(window.sessionStorage.getItem(WARMUP_STORAGE_KEY));
    if (last > 0 && now >= last && now - last < WARMUP_WINDOW_MS) return false;
    window.sessionStorage.setItem(WARMUP_STORAGE_KEY, String(now));
  } catch { /* storage is optional; module flag still prevents remount duplicates */ }
  return true;
}

/** One best-effort warm-up, skipped when landing already attempted it recently. No retries or UI. */
export function warmUpApi(): void {
  if (warmed || typeof window === "undefined" || typeof fetch !== "function") return;
  warmed = true;
  if (!claimWarmup()) return;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 65_000);
  try {
    void rateLimitedFetch(`${API_BASE_URL}/v1/healthz`, {
      method: "GET", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", signal: controller.signal,
    }).catch(() => undefined).finally(() => window.clearTimeout(timer));
  } catch {
    window.clearTimeout(timer);
  }
}

/** Test helper. */
export function resetApiWarmupForTests(): void {
  warmed = false;
}
