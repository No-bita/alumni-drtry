import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("Business availability", () => {
  it.each([undefined, "false", "true"])("production does not depend on former flag %s", async (flag) => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_ENABLE_BUILD_INTENT_PAGE", flag);
    vi.resetModules();
    const { isBuildIntentPageEnabled } = await import("../src/lib/buildIntentPage");
    expect(isBuildIntentPageEnabled).toBe(true);
  });
});
