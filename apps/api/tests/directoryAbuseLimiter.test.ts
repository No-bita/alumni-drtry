import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertIpAllowed, resetIpHitsForTests } from "../src/lib/directoryAbuseLimiter.js";
import { AppError } from "../src/lib/errors.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-10T00:00:00Z"));
  resetIpHitsForTests();
});
afterEach(() => vi.useRealTimers());

describe("assertIpAllowed (per-IP, in memory)", () => {
  it("allows up to the limit, then a 429 with retry-after", () => {
    assertIpAllowed("discovery", "203.0.113.1", 2, 1);
    assertIpAllowed("discovery", "203.0.113.1", 2, 1);
    try {
      assertIpAllowed("discovery", "203.0.113.1", 2, 1);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect(e).toMatchObject({ statusCode: 429, code: "DISCOVERY_RATE_LIMITED" });
      expect((e as AppError).retryAfterSeconds).toBe(60);
    }
  });

  it("counts addresses and route families separately; resets after the window", () => {
    assertIpAllowed("discovery", "203.0.113.2", 1, 1);
    expect(() => assertIpAllowed("discovery", "203.0.113.3", 1, 1)).not.toThrow();
    expect(() => assertIpAllowed("auth-verify", "203.0.113.2", 1, 1)).not.toThrow();
    expect(() => assertIpAllowed("discovery", "203.0.113.2", 1, 1)).toThrow(AppError);
    vi.advanceTimersByTime(61_000);
    expect(() => assertIpAllowed("discovery", "203.0.113.2", 1, 1)).not.toThrow();
  });

  it("is off when the limit is 0 or the address is unknown", () => {
    for (let i = 0; i < 5; i += 1) assertIpAllowed("discovery", "203.0.113.4", 0, 1);
    for (let i = 0; i < 5; i += 1) assertIpAllowed("discovery", null, 1, 1);
  });

  it("uses the code and message it is given", () => {
    assertIpAllowed("auth-verify", "203.0.113.5", 1, 10, "AUTH_RATE_LIMITED", "Slow down.");
    expect(() => assertIpAllowed("auth-verify", "203.0.113.5", 1, 10, "AUTH_RATE_LIMITED", "Slow down.")).toThrow(
      expect.objectContaining({ code: "AUTH_RATE_LIMITED", message: "Slow down." })
    );
  });
});
