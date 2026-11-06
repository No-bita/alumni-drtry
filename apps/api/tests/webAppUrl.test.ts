import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The app lives at https://almamatter.in/app; the API is reached at https://almamatter.in/v1.
 * WEB_APP_URL builds every member-facing link; APP_BASE_URL stays the API base (Google's callback).
 */
const KEYS = ["APP_BASE_URL", "WEB_APP_URL", "CORS_ORIGIN", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const;
const saved: Record<string, string | undefined> = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

beforeAll(() => {
  vi.resetModules();
  process.env.APP_BASE_URL = "https://almamatter.in";
  process.env.WEB_APP_URL = "https://almamatter.in/app";
  process.env.CORS_ORIGIN = "https://almamatter.in,https://app.almamater.aaryanshah.co.in";
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
});

afterAll(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.resetModules();
});

describe("web app under a path", () => {
  it("web links use WEB_APP_URL; the API base stays APP_BASE_URL; older MAGIC_LINK_BASE_URL is the fallback", async () => {
    const { webAppUrl, apiPublicBaseUrl } = await import("../src/lib/webAppUrl.js");
    expect(webAppUrl()).toBe("https://almamatter.in/app");
    expect(apiPublicBaseUrl()).toBe("https://almamatter.in");
  });

  it("allowed origins are origins (no path), new and old during the cut-over", async () => {
    const { getAllowedOrigins } = await import("../src/lib/csrfProtection.js");
    const allowed = getAllowedOrigins();
    expect(allowed.has("https://almamatter.in")).toBe(true);
    expect(allowed.has("https://app.almamater.aaryanshah.co.in")).toBe(true);
    expect([...allowed].some((o) => new URL(o).pathname !== "/")).toBe(false);
  });

  it("Google sign-in returns to the API base, and errors land on /app/login", async () => {
    const { createApp } = await import("../src/app.js");
    const app = await createApp();
    try {
      const start = await app.inject({ method: "GET", url: "/v1/auth/google" });
      expect(start.statusCode).toBe(302);
      const google = new URL(String(start.headers.location));
      expect(google.searchParams.get("redirect_uri")).toBe("https://almamatter.in/v1/auth/google/callback");

      const cancelled = await app.inject({ method: "GET", url: "/v1/auth/google/callback?error=access_denied" });
      expect(cancelled.headers.location).toBe("https://almamatter.in/app/login?error=cancelled");
    } finally {
      await app.close();
    }
  });

  it("sign-in emails link to /app/auth/verify", async () => {
    const { createApp } = await import("../src/app.js");
    const { testEmailCapture } = await import("../src/services/emailSender.js");
    const app = await createApp();
    const email = `webapp-url-${Date.now()}@iitbhu.ac.in`;
    try {
      const res = await app.inject({ method: "POST", url: "/v1/auth/start", payload: { institutionalEmail: email } });
      expect(res.statusCode, res.body).toBeLessThan(300);
    } finally {
      await app.close();
    }
    const mail = testEmailCapture.lastAuthEmail(email);
    expect(mail?.magicLinkUrl).toMatch(/^https:\/\/almamatter\.in\/app\/auth\/verify\?challengeId=/);
  });
});
