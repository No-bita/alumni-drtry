import type { ApiError } from "../api/client";

export type AuthStartResult<T> = {
  data?: T;
  error?: ApiError;
  retryAfterSeconds?: number;
  aborted?: boolean;
  /** HTTP status when the server (or its proxy) answered. Missing for network failures. */
  status?: number;
};

export type AuthStartOutcome<T> =
  | { kind: "done"; result: AuthStartResult<T> }
  | { kind: "timeout" }
  | { kind: "aborted" };

/** Gaps between attempts (ms). One request first, then gentle backoff: 3s, 5s, 8s, 10s, 10s... */
export const WAKE_BACKOFF_MS = [3000, 5000, 8000, 10000] as const;
/** After this long without a usable answer we stop and say so. */
export const WAKE_DEADLINE_MS = 45000;

/**
 * True only when the request most likely never reached the app: the host is asleep or
 * restarting (502/503/504 from the proxy) or the network call failed outright.
 * Anything the app itself answered (validation, rate limit, not allowed) is final.
 */
export function isServerWaking<T>(result: AuthStartResult<T>): boolean {
  if (result.data !== undefined || !result.error) return false;
  if (result.error.code === "NETWORK_ERROR") return true;
  return result.status === 502 || result.status === 503 || result.status === 504;
}

type Deps = {
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
};

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        resolve();
      },
      { once: true }
    );
  });

/**
 * Send sign-in start once. If the server looks asleep, tell the UI (`onWaking`, once) and
 * retry one request at a time with backoff until the deadline. Never fires in parallel.
 */
export async function startAuthWithWakeRetry<T>(
  send: (signal: AbortSignal) => Promise<AuthStartResult<T>>,
  opts: { signal?: AbortSignal; onWaking?: () => void; deadlineMs?: number; backoffMs?: readonly number[] } & Deps = {}
): Promise<AuthStartOutcome<T>> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? defaultSleep;
  const deadlineMs = opts.deadlineMs ?? WAKE_DEADLINE_MS;
  const backoff = opts.backoffMs ?? WAKE_BACKOFF_MS;
  const started = now();
  const controller = new AbortController();
  opts.signal?.addEventListener("abort", () => controller.abort(), { once: true });
  let announced = false;

  for (let attempt = 0; ; attempt += 1) {
    if (controller.signal.aborted) return { kind: "aborted" };
    const result = await send(controller.signal);
    if (result.aborted || controller.signal.aborted) return { kind: "aborted" };
    if (!isServerWaking(result)) return { kind: "done", result };
    if (now() - started >= deadlineMs) return { kind: "timeout" };
    if (!announced) {
      announced = true;
      opts.onWaking?.();
    }
    const gap = backoff[Math.min(attempt, backoff.length - 1)];
    if (now() - started + gap >= deadlineMs) {
      await sleep(Math.max(0, deadlineMs - (now() - started)), controller.signal);
      if (controller.signal.aborted) return { kind: "aborted" };
      // Deadline reached; one last try is not allowed, so report honestly.
      return { kind: "timeout" };
    }
    await sleep(gap, controller.signal);
  }
}
