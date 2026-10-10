import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function load() {
  vi.resetModules();
  return (await import("../src/lib/devHubPages")).isDevHubPagesEnabled;
}

describe("isDevHubPagesEnabled", () => {
  it("is off in a production build by default", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_ENABLE_DEV_HUB_PAGES", "");
    expect(await load()).toBe(false);
  });
  it("can be switched on explicitly", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_ENABLE_DEV_HUB_PAGES", "true");
    expect(await load()).toBe(true);
  });
  it("is on in dev", async () => {
    vi.stubEnv("DEV", true);
    expect(await load()).toBe(true);
  });
});
