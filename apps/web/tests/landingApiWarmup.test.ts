import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("landing performs one bounded read even after429, and Login deduplicates it", async () => {
  vi.resetModules(); window.sessionStorage.clear(); vi.useFakeTimers();
  const fetch = vi.fn().mockResolvedValue(new Response("", { status: 429 })); vi.stubGlobal("fetch", fetch);
  const landing = await import("../../landing/lib/apiWarmup");
  landing.warmUpLandingApi(); landing.warmUpLandingApi();
  await vi.runAllTimersAsync(); expect(fetch).toHaveBeenCalledOnce();
  const { warmUpApi } = await import("../src/lib/apiWarmup");
  warmUpApi(); expect(fetch).toHaveBeenCalledOnce();
});

it("landing catches synchronous failure and blocked storage without breaking rendering", async () => {
  vi.resetModules(); vi.useFakeTimers();
  vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => { throw Error("disabled"); });
  const fetch = vi.fn(() => { throw Error("network"); }); vi.stubGlobal("fetch", fetch);
  const landing = await import("../../landing/lib/apiWarmup");
  expect(() => landing.warmUpLandingApi()).not.toThrow(); landing.warmUpLandingApi();
  expect(fetch).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0); vi.restoreAllMocks();
});
