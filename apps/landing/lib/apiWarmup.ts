export const WARMUP_STORAGE_KEY = "alma-api-warmup-v1";
export const WARMUP_WINDOW_MS = 10 * 60_000;

/** Shared wire format with the Login warm-up: timestamp only, no member data. */
export function claimWarmup(storage: Pick<Storage, "getItem" | "setItem"> | null, now = Date.now()): boolean {
  try {
    const last = Number(storage?.getItem(WARMUP_STORAGE_KEY));
    if (last > 0 && now >= last && now - last < WARMUP_WINDOW_MS) return false;
    storage?.setItem(WARMUP_STORAGE_KEY, String(now));
  } catch {
    // Storage can be blocked. The caller still deduplicates within this document.
  }
  return true;
}

let attempted = false;
/** A single best-effort read, never readiness, a retry loop, or an auth request. */
export function warmUpLandingApi(): void {
  if (attempted || typeof window === "undefined" || typeof fetch !== "function") return;
  attempted = true;
  let storage: Storage | null = null;
  try { storage = window.sessionStorage; } catch { /* storage is optional */ }
  if (!claimWarmup(storage)) return;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 65_000);
  try {
    void fetch("/v1/healthz", {
      method: "GET", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", signal: controller.signal,
    }).catch(() => undefined).finally(() => window.clearTimeout(timer));
  } catch {
    window.clearTimeout(timer);
  }
}
