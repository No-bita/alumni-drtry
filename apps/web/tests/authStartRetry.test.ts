import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/api/client";
import {
  WAKE_BACKOFF_MS,
  WAKE_DEADLINE_MS,
  isServerWaking,
  startAuthWithWakeRetry,
  type AuthStartResult,
} from "../src/lib/authStartRetry";
import { resetApiWarmupForTests, warmUpApi } from "../src/lib/apiWarmup";

const ok: AuthStartResult<{ challengeId: string }> = { data: { challengeId: "c1" } };
const bad503: AuthStartResult<{ challengeId: string }> = { error: { code: "UNKNOWN", message: "Service Unavailable" }, status: 503 };

function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: vi.fn(async (ms: number) => {
      t += ms;
    }),
    advance: (ms: number) => {
      t += ms;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetApiWarmupForTests();
});

describe("isServerWaking", () => {
  it("treats proxy gateway errors and network failures as waking", () => {
    expect(isServerWaking(bad503)).toBe(true);
    expect(isServerWaking({ error: { code: "UNKNOWN" }, status: 502 })).toBe(true);
    expect(isServerWaking({ error: { code: "UNKNOWN" }, status: 504 })).toBe(true);
    expect(isServerWaking({ error: { code: "NETWORK_ERROR" } })).toBe(true);
  });
  it("never retries answers the app itself gave", () => {
    expect(isServerWaking(ok)).toBe(false);
    expect(isServerWaking({ error: { code: "AUTH_RATE_LIMITED" }, status: 429 })).toBe(false);
    expect(isServerWaking({ error: { code: "AUTH_BAD_REQUEST" }, status: 400 })).toBe(false);
    expect(isServerWaking({ error: { code: "AUTH_DOMAIN_NOT_ALLOWED" }, status: 403 })).toBe(false);
    expect(isServerWaking({ error: { code: "UNKNOWN" }, status: 500 })).toBe(false);
  });
  it("never retries the app's own 503 that may follow an email (no silent pile of emails)", () => {
    expect(isServerWaking({ error: { code: "AUTH_DELIVERY_FAILED", message: "x" }, status: 503 })).toBe(false);
  });
  it("retries the app's 'briefly busy' answer, which sends nothing", () => {
    expect(isServerWaking({ error: { code: "AUTH_START_BUSY", message: "x" }, status: 503 })).toBe(true);
  });
});

describe("startAuthWithWakeRetry", () => {
  it("sends exactly one request when the server answers", async () => {
    const send = vi.fn().mockResolvedValue(ok);
    const onWaking = vi.fn();
    const out = await startAuthWithWakeRetry(send, { onWaking, ...clock() });
    expect(out).toEqual({ kind: "done", result: ok });
    expect(send).toHaveBeenCalledTimes(1);
    expect(onWaking).not.toHaveBeenCalled();
  });

  it("announces waking once, backs off, and succeeds when the server comes up", async () => {
    const c = clock();
    const send = vi.fn().mockResolvedValueOnce(bad503).mockResolvedValueOnce(bad503).mockResolvedValueOnce(ok);
    const onWaking = vi.fn();
    const out = await startAuthWithWakeRetry(send, { onWaking, ...c });
    expect(out).toEqual({ kind: "done", result: ok });
    expect(send).toHaveBeenCalledTimes(3);
    expect(onWaking).toHaveBeenCalledTimes(1);
    expect(c.sleep.mock.calls.map((x) => x[0])).toEqual([WAKE_BACKOFF_MS[0], WAKE_BACKOFF_MS[1]]);
  });

  it("is sequential, bounded, and ends in an honest timeout (no request storm)", async () => {
    const c = clock();
    const send = vi.fn().mockResolvedValue(bad503);
    const out = await startAuthWithWakeRetry(send, { onWaking: vi.fn(), ...c });
    expect(out).toEqual({ kind: "timeout" });
    expect(send.mock.calls.length).toBeLessThanOrEqual(8);
    expect(c.now()).toBeLessThanOrEqual(WAKE_DEADLINE_MS);
  });

  it("does not retry a rate-limit answer", async () => {
    const rl: AuthStartResult<{ challengeId: string }> = { error: { code: "AUTH_RATE_LIMITED" }, status: 429, retryAfterSeconds: 60 };
    const send = vi.fn().mockResolvedValue(rl);
    const out = await startAuthWithWakeRetry(send, clock());
    expect(out).toEqual({ kind: "done", result: rl });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("stops quietly when cancelled", async () => {
    const ctl = new AbortController();
    const send = vi.fn(async () => {
      ctl.abort();
      return bad503;
    });
    const out = await startAuthWithWakeRetry(send, { signal: ctl.signal, ...clock() });
    expect(out).toEqual({ kind: "aborted" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("works end to end with api.post: 503, 502, then a real answer", async () => {
    const responses = [
      new Response("bad gateway", { status: 503, statusText: "Service Unavailable" }),
      new Response("bad gateway", { status: 502, statusText: "Bad Gateway" }),
      new Response(JSON.stringify({ challengeId: "abc" }), { status: 200 }),
    ];
    const fetchMock = vi.fn(async () => responses.shift()!);
    vi.stubGlobal("fetch", fetchMock);
    const out = await startAuthWithWakeRetry(
      (signal) => api.post<{ challengeId: string }>("/v1/auth/start", { institutionalEmail: "a@itbhu.ac.in" }, { signal }),
      { ...clock() }
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(out.kind).toBe("done");
    if (out.kind === "done") expect(out.result.data?.challengeId).toBe("abc");
  });
});

describe("startAuthWithWakeRetry hung request", () => {
  it("times out and aborts a request that never answers", async () => {
    let seen: AbortSignal | undefined;
    const send = vi.fn(
      (signal: AbortSignal) =>
        new Promise<AuthStartResult<{ challengeId: string }>>(() => {
          seen = signal;
        })
    );
    const out = await startAuthWithWakeRetry(send, { deadlineMs: 30 });
    expect(out).toEqual({ kind: "timeout" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(seen?.aborted).toBe(true);
  });
});

describe("warmUpApi", () => {
  it("fires one quiet GET to the health route and never again", () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    warmUpApi();
    warmUpApi();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/v1\/healthz$/);
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("omit");
  });
  it("swallows failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));
    expect(() => warmUpApi()).not.toThrow();
    await Promise.resolve();
  });
});
