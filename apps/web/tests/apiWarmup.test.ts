import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { warmUpApi, resetApiWarmupForTests } from "../src/lib/apiWarmup";
import { resetApiRateLimitForTests } from "../src/lib/apiRateLimit";

beforeEach(() => { vi.useFakeTimers(); window.sessionStorage.clear(); resetApiWarmupForTests(); resetApiRateLimitForTests(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("one-shot warm-up shared with landing", () => {
  it("skips a recent landing attempt across full-page navigation", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    window.sessionStorage.setItem("alma-api-warmup-v1", String(Date.now()));
    warmUpApi(); expect(fetch).not.toHaveBeenCalled();
  });
  it("sends one same-origin cookieless request and no remount duplicate", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("ok")); vi.stubGlobal("fetch", fetch);
    warmUpApi(); warmUpApi();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("/v1/healthz", expect.objectContaining({ credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" }));
    await vi.runAllTimersAsync();
  });
  it("permits a fresh document to warm after the ten-minute dedup window", () => {
    const fetch = vi.fn().mockResolvedValue(new Response("ok")); vi.stubGlobal("fetch", fetch);
    window.sessionStorage.setItem("alma-api-warmup-v1", String(Date.now() - 600_000));
    warmUpApi(); expect(fetch).toHaveBeenCalledOnce();
  });
  it("aborts a stalled read after65seconds without retrying", async () => {
    const fetch = vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))))); vi.stubGlobal("fetch", fetch);
    warmUpApi(); await vi.advanceTimersByTimeAsync(65_000);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true); expect(fetch).toHaveBeenCalledOnce();
  });
  it("does not retry rejected or rate-limited attempts", async () => {
    const fetch = vi.fn().mockRejectedValue(Error("offline")); vi.stubGlobal("fetch", fetch);
    warmUpApi(); await vi.runAllTimersAsync(); warmUpApi(); expect(fetch).toHaveBeenCalledOnce();
    resetApiWarmupForTests(); window.sessionStorage.clear(); fetch.mockResolvedValue(new Response("", { status: 429 }));
    warmUpApi(); await vi.runAllTimersAsync(); resetApiWarmupForTests(); window.sessionStorage.clear(); warmUpApi(); expect(fetch).toHaveBeenCalledTimes(2);
  });
});
