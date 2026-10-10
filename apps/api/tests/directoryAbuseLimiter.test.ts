import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  DISCOVERY_READ_WINDOW_MINUTES: 1,
  DISCOVERY_READ_MAX_PER_USER_WINDOW: 2,
  DISCOVERY_READ_MAX_PER_IP_WINDOW: 3,
}));
vi.mock("../src/config/env.js", () => ({ env: envMock }));

import { assertDiscoveryReadAllowed } from "../src/lib/directoryAbuseLimiter.js";
import { AppError } from "../src/lib/errors.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-10T00:00:00Z"));
  envMock.DISCOVERY_READ_MAX_PER_USER_WINDOW = 2;
  envMock.DISCOVERY_READ_MAX_PER_IP_WINDOW = 3;
});
afterEach(() => vi.useRealTimers());

describe("assertDiscoveryReadAllowed", () => {
  it("allows up to the per-user limit then throws a 429 with retry-after", () => {
    assertDiscoveryReadAllowed("user-a", null);
    assertDiscoveryReadAllowed("user-a", null);
    try {
      assertDiscoveryReadAllowed("user-a", null);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect(e).toMatchObject({ statusCode: 429, code: "DISCOVERY_RATE_LIMITED" });
      expect((e as AppError).retryAfterSeconds).toBe(60);
    }
  });

  it("counts users independently", () => {
    assertDiscoveryReadAllowed("user-b", null);
    assertDiscoveryReadAllowed("user-b", null);
    expect(() => assertDiscoveryReadAllowed("user-c", null)).not.toThrow();
  });

  it("frees the budget once the window has passed", () => {
    assertDiscoveryReadAllowed("user-d", null);
    assertDiscoveryReadAllowed("user-d", null);
    vi.advanceTimersByTime(61_000);
    expect(() => assertDiscoveryReadAllowed("user-d", null)).not.toThrow();
  });

  it("reports the remaining wait, rounded up", () => {
    assertDiscoveryReadAllowed("user-e", null);
    vi.advanceTimersByTime(20_000);
    assertDiscoveryReadAllowed("user-e", null);
    try {
      assertDiscoveryReadAllowed("user-e", null);
    } catch (e) {
      expect((e as AppError).retryAfterSeconds).toBe(40);
    }
  });

  it("limits per IP across different users", () => {
    for (const u of ["u1", "u2", "u3"]) assertDiscoveryReadAllowed(u, "9.9.9.9");
    expect(() => assertDiscoveryReadAllowed("u4", "9.9.9.9")).toThrow(AppError);
    expect(() => assertDiscoveryReadAllowed("u5", "8.8.8.8")).not.toThrow();
  });

  it("ignores limits set to 0 and missing IPs", () => {
    envMock.DISCOVERY_READ_MAX_PER_USER_WINDOW = 0;
    envMock.DISCOVERY_READ_MAX_PER_IP_WINDOW = 0;
    for (let i = 0; i < 20; i += 1) assertDiscoveryReadAllowed("user-f", "1.1.1.1");
  });
});
