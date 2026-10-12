import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("auth", () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("rejects auth start with disallowed domain", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/start",
      payload: { institutionalEmail: "user@gmail.com" }
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe("AUTH_DOMAIN_NOT_ALLOWED");
  });

  it("rejects auth start with invalid email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/start",
      payload: { institutionalEmail: "not-an-email" }
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe("AUTH_BAD_REQUEST");
  });

  it("rejects auth verify with neither otp nor magicLinkToken", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/verify",
      payload: { challengeId: "00000000-0000-0000-0000-000000000000" }
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe("AUTH_BAD_REQUEST");
  });

  it("rejects auth verify with both otp and magicLinkToken", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/verify",
      payload: {
        challengeId: "00000000-0000-0000-0000-000000000000",
        otp: "123456",
        magicLinkToken: "a".repeat(32)
      }
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe("AUTH_BAD_REQUEST");
  });

  it("rejects auth verify with invalid challenge id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/verify",
      payload: {
        challengeId: "not-a-uuid",
        otp: "123456"
      }
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe("AUTH_BAD_REQUEST");
  });

  it("rejects unauthenticated /v1/me", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/me"
    });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.code).toBe("AUTH_UNAUTHORIZED");
  });

  it("rejects invite login when beta invite auth is disabled", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/invite-login",
      payload: { institutionalEmail: "user@iitbhu.ac.in", inviteCode: "demo" }
    });
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe("AUTH_INVITE_DISABLED");
  });

  it("rejects invite login payload with invalid email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/invite-login",
      payload: { institutionalEmail: "not-an-email", inviteCode: "demo" }
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe("AUTH_BAD_REQUEST");
  });

  it("returns demo auth config as disabled by default", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/auth/demo/config"
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.enabled).toBe(false);
  });

  it("rejects demo login with invalid payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/demo-login",
      payload: { email: "not-an-email" }
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe("AUTH_BAD_REQUEST");
  });

  it("rejects demo login when demo auth is disabled", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/demo-login",
      payload: { email: "demo@alumni.test", password: "password123" }
    });
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe("DEMO_AUTH_DISABLED");
  });

  it("accepts allowed domain and returns challenge (requires DB)", async () => {
    const email = `auth-${Date.now()}@iitbhu.ac.in`;
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/start",
      payload: { institutionalEmail: email }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.challengeId).toBeDefined();
    expect(body.sentTo).toBe(email);
    if (process.env.SHOW_AUTH_SECRETS_IN_RESPONSE === "true") {
      expect(body.debug?.otp).toBeDefined();
      expect(body.debug?.magicLinkUrl).toContain("auth/verify");
      expect(body.debug?.magicLinkUrl).toContain("challengeId=");
      expect(body.debug?.magicLinkUrl).toContain("magicLinkToken=");
    }
  });

  it("returns 429 and Retry-After when per-email auth start limit exceeded (requires DB)", async () => {
    const email = `ratelimit-${Date.now()}@iitbhu.ac.in`;
    const limit = Number(process.env.AUTH_START_MAX_PER_EMAIL_WINDOW ?? 3);
    for (let i = 0; i < limit; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/start",
        payload: { institutionalEmail: email },
      });
      expect(res.statusCode, res.body).toBe(200);
    }
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/start",
      payload: { institutionalEmail: email },
    });
    expect(res.statusCode, res.body).toBe(429);
    const body = res.json() as { code: string; message?: string };
    expect(body.code).toBe("AUTH_RATE_LIMITED");
    const retryAfter = res.headers["retry-after"];
    expect(retryAfter, "429 response must include Retry-After so clients can back off").toBeDefined();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });
});
