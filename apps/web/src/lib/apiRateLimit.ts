/**
 * Temporary request brake for the current infrastructure. This contains client traffic
 * after a 429; it does not identify which upstream layer issued it or fix that layer.
 * Never automatically replay a write or sign-in request.
 */
export type RateLimitState = { paused: boolean; retryAt: number | null };
const empty: RateLimitState = { paused: false, retryAt: null };
let state = empty;
let manualInFlight = false;
const listeners = new Set<() => void>();
const pendingReads = new Set<AbortController>();
export const getApiRateLimit = () => state;
export const subscribeApiRateLimit = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
function publish(next: RateLimitState) { state = next; listeners.forEach((fn) => fn()); }
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) {
    const retryAt = now + Number(value.trim()) * 1000;
    return Number.isFinite(retryAt) && retryAt <= 8.64e15 ? retryAt : null;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(now, date) : null;
}
function pausedResponse() {
  const seconds = state.retryAt === null ? null : Math.max(0, Math.ceil((state.retryAt - Date.now()) / 1000));
  return new Response(JSON.stringify({ code: 'CLIENT_RATE_LIMITED', message: seconds ? `Requests paused. Try again in ${seconds} seconds.` : 'Requests paused after too many requests. Use Retry to check again.' }), {
    status: 429, headers: { 'content-type': 'application/json', ...(seconds === null ? {} : { 'retry-after': String(seconds) }) },
  });
}
export async function rateLimitedFetch(url: string, init: RequestInit = {}, manualRetry = false): Promise<Response> {
  if (state.paused && (!manualRetry || (state.retryAt !== null && Date.now() < state.retryAt))) return pausedResponse();
  if (manualRetry && manualInFlight) return pausedResponse();
  if (manualRetry) manualInFlight = true;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  init.signal?.addEventListener('abort', abort, { once: true });
  const read = !init.method || init.method === 'GET';
  if (read) pendingReads.add(controller);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (response.status === 429) {
      const next = parseRetryAfter(response.headers.get('retry-after'));
      // Preserve the longest known server cooldown when several in-flight responses arrive.
      publish({ paused: true, retryAt: Math.max(state.retryAt ?? 0, next ?? 0) || null });
      for (const other of pendingReads) if (other !== controller) other.abort();
    }
    return response;
  } finally {
    pendingReads.delete(controller);
    init.signal?.removeEventListener('abort', abort);
    if (manualRetry) manualInFlight = false;
  }
}
export function resumeApiAfterExplicitSignIn() { publish(empty); }
export function resetApiRateLimitForTests() { publish(empty); manualInFlight = false; pendingReads.clear(); }
