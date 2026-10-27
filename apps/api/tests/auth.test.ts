import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { ConsoleEmailSender, EmailDeliveryUnconfirmedError, neverConnected } from "../src/services/emailSender.js";

describe("auth", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  const db = new Pool({ connectionString: process.env.DATABASE_URL });

  let sendAuthEmailSpy: ReturnType<typeof vi.spyOn<ConsoleEmailSender, "sendAuthEmail">>;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app?.close();
    await db.end();
  });

  beforeEach(() => {
    // Calls through to the console sender; the spy only counts/intercepts dispatches.
    sendAuthEmailSpy = vi.spyOn(ConsoleEmailSender.prototype, "sendAuthEmail");
  });

  afterEach(() => {
    sendAuthEmailSpy.mockRestore();
  });

  const startAuth = (institutionalEmail: string) =>
    app.inject({ method: "POST", url: "/v1/auth/start", payload: { institutionalEmail } });

  const challengeCount = async (email: string): Promise<number> => {
    const r = await db.query<{ count: string }>(
      "SELECT COUNT(*)::TEXT AS count FROM auth_challenges WHERE institutional_email = $1",
      [email]
    );
    return Number(r.rows[0]?.count ?? "0");
  };

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
      // Rapid repeats reuse the active challenge (see duplicate-start tests below), so
      // age this one past the duplicate window - each loop iteration then mints a new
      // challenge and the per-email cap binds as intended.
      const { challengeId } = res.json() as { challengeId: string };
      await db.query(
        "UPDATE auth_challenges SET created_at = now() - interval '3 minutes' WHERE id = $1",
        [challengeId]
      );
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

  it("rapid repeat start reuses the active challenge and sends no second email (requires DB)", async () => {
    const email = `dedupe-${Date.now()}@iitbhu.ac.in`;
    const first = await startAuth(email);
    expect(first.statusCode, first.body).toBe(200);
    const second = await startAuth(email);
    expect(second.statusCode, second.body).toBe(200);
    const a = first.json() as { challengeId: string; sentTo: string };
    const b = second.json() as { challengeId: string; sentTo: string };
    expect(b.challengeId).toBe(a.challengeId);
    expect(b.sentTo).toBe(email);
    expect(await challengeCount(email)).toBe(1);
    expect(sendAuthEmailSpy).toHaveBeenCalledTimes(1);
  });

  it("two concurrent starts send exactly one email and return the same challenge (requires DB)", async () => {
    const email = `dedupe-race-${Date.now()}@iitbhu.ac.in`;
    const [first, second] = await Promise.all([startAuth(email), startAuth(email)]);
    expect(first.statusCode, first.body).toBe(200);
    expect(second.statusCode, second.body).toBe(200);
    const a = first.json() as { challengeId: string };
    const b = second.json() as { challengeId: string };
    expect(b.challengeId).toBe(a.challengeId);
    expect(await challengeCount(email)).toBe(1);
    expect(sendAuthEmailSpy).toHaveBeenCalledTimes(1);
  });

  it("a failed dispatch rolls the challenge back and the next start sends fresh (requires DB)", async () => {
    const email = `dedupe-fail-${Date.now()}@iitbhu.ac.in`;
    sendAuthEmailSpy.mockRejectedValueOnce(new Error("provider down"));
    const failed = await startAuth(email);
    expect(failed.statusCode, failed.body).toBe(503);
    expect((failed.json() as { code: string }).code).toBe("AUTH_DELIVERY_FAILED");
    // Rolled back: nothing active for a repeat start to point at.
    expect(await challengeCount(email)).toBe(0);

    const retried = await startAuth(email);
    expect(retried.statusCode, retried.body).toBe(200);
    expect((retried.json() as { challengeId: string }).challengeId).toBeDefined();
    expect(await challengeCount(email)).toBe(1);
    expect(sendAuthEmailSpy).toHaveBeenCalledTimes(2);
  });

  it("mints a fresh challenge once the previous start is outside the duplicate window (requires DB)", async () => {
    const email = `dedupe-window-${Date.now()}@iitbhu.ac.in`;
    const first = await startAuth(email);
    expect(first.statusCode, first.body).toBe(200);
    const { challengeId } = first.json() as { challengeId: string };
    await db.query(
      "UPDATE auth_challenges SET created_at = now() - interval '3 minutes' WHERE id = $1",
      [challengeId]
    );
    const second = await startAuth(email);
    expect(second.statusCode, second.body).toBe(200);
    expect((second.json() as { challengeId: string }).challengeId).not.toBe(challengeId);
    expect(await challengeCount(email)).toBe(2);
    expect(sendAuthEmailSpy).toHaveBeenCalledTimes(2);
  });

  it("does not reuse a consumed or expired challenge (requires DB)", async () => {
    const consumedEmail = `dedupe-consumed-${Date.now()}@iitbhu.ac.in`;
    const c1 = await startAuth(consumedEmail);
    expect(c1.statusCode, c1.body).toBe(200);
    const { challengeId: consumedId } = c1.json() as { challengeId: string };
    await db.query("UPDATE auth_challenges SET consumed_at = now() WHERE id = $1", [consumedId]);
    const c2 = await startAuth(consumedEmail);
    expect(c2.statusCode, c2.body).toBe(200);
    expect((c2.json() as { challengeId: string }).challengeId).not.toBe(consumedId);

    const expiredEmail = `dedupe-expired-${Date.now()}@iitbhu.ac.in`;
    const e1 = await startAuth(expiredEmail);
    expect(e1.statusCode, e1.body).toBe(200);
    const { challengeId: expiredId } = e1.json() as { challengeId: string };
    await db.query(
      "UPDATE auth_challenges SET otp_expires_at = now() - interval '1 minute' WHERE id = $1",
      [expiredId]
    );
    const e2 = await startAuth(expiredEmail);
    expect(e2.statusCode, e2.body).toBe(200);
    expect((e2.json() as { challengeId: string }).challengeId).not.toBe(expiredId);
    expect(sendAuthEmailSpy).toHaveBeenCalledTimes(4);
  });

  it("mints a fresh challenge when the latest one is OTP-exhausted (requires DB)", async () => {
    const email = `dedupe-exhausted-${Date.now()}@iitbhu.ac.in`;
    const first = await startAuth(email);
    expect(first.statusCode, first.body).toBe(200);
    const { challengeId } = first.json() as { challengeId: string };
    await db.query("UPDATE auth_challenges SET attempts = max_attempts WHERE id = $1", [challengeId]);
    const second = await startAuth(email);
    expect(second.statusCode, second.body).toBe(200);
    expect((second.json() as { challengeId: string }).challengeId).not.toBe(challengeId);
    expect(await challengeCount(email)).toBe(2);
    expect(sendAuthEmailSpy).toHaveBeenCalledTimes(2);
  });

  // --- The screen and the inbox must agree (fix/sign-in-emails) ---

  const verifyOtp = (challengeId: string, otp: string) =>
    app.inject({ method: "POST", url: "/v1/auth/verify", payload: { challengeId, otp } });
  const debugOf = (res: { json: () => unknown }) =>
    (res.json() as { challengeId: string; debug: { otp: string; magicLinkUrl: string } });
  const ageChallenge = (id: string) =>
    db.query("UPDATE auth_challenges SET created_at = now() - interval '3 minutes' WHERE id = $1", [id]);

  it("says what happened: sent, then already_sent with the time left before a resend (requires DB)", async () => {
    const email = `delivery-${Date.now()}@iitbhu.ac.in`;
    const first = (await startAuth(email)).json() as { delivery: string; resendAfterSeconds: number };
    expect(first.delivery).toBe("sent");
    expect(first.resendAfterSeconds).toBe(120);
    const again = (await startAuth(email)).json() as { delivery: string; resendAfterSeconds: number; debug?: unknown };
    expect(again.delivery).toBe("already_sent");
    expect(again.resendAfterSeconds).toBeGreaterThan(100);
    expect(again.resendAfterSeconds).toBeLessThanOrEqual(120);
    expect(again.debug).toBeUndefined();
    expect(sendAuthEmailSpy).toHaveBeenCalledTimes(1);
  });

  it("no answer from the provider keeps the code, and retries send no second email (requires DB)", async () => {
    const email = `unconfirmed-${Date.now()}@iitbhu.ac.in`;
    sendAuthEmailSpy.mockRejectedValueOnce(new EmailDeliveryUnconfirmedError("Resend did not answer: timeout"));
    const first = await startAuth(email);
    expect(first.statusCode, first.body).toBe(200);
    expect((first.json() as { delivery: string }).delivery).toBe("unconfirmed");
    const { challengeId, debug } = debugOf(first);

    // The client retrying (or the user tapping again) reuses it: still exactly one email.
    const retry = await startAuth(email);
    expect((retry.json() as { challengeId: string; delivery: string }).challengeId).toBe(challengeId);
    expect((retry.json() as { delivery: string }).delivery).toBe("already_sent");
    expect(sendAuthEmailSpy).toHaveBeenCalledTimes(1);
    expect(await challengeCount(email)).toBe(1);

    // If that email did arrive, its code works.
    const ok = await verifyOtp(challengeId, debug.otp);
    expect(ok.statusCode, ok.body).toBe(200);
  });

  it("a newer code retires older ones: old code says 'use the latest email', new code works (requires DB)", async () => {
    const email = `supersede-${Date.now()}@iitbhu.ac.in`;
    const first = debugOf(await startAuth(email));
    await ageChallenge(first.challengeId);
    const second = debugOf(await startAuth(email));
    expect(second.challengeId).not.toBe(first.challengeId);

    // Old code typed into the screen (which holds the newest challenge id).
    const typedOld = await verifyOtp(second.challengeId, first.debug.otp);
    expect(typedOld.statusCode).toBe(401);
    expect((typedOld.json() as { code: string }).code).toBe("AUTH_CODE_SUPERSEDED");
    // Old link (carries its own challenge id).
    const oldLink = new URL(first.debug.magicLinkUrl);
    const viaOldLink = await app.inject({
      method: "GET",
      url: `/v1/auth/verify?challengeId=${encodeURIComponent(oldLink.searchParams.get("challengeId")!)}&magicLinkToken=${encodeURIComponent(oldLink.searchParams.get("magicLinkToken")!)}`,
    });
    expect((viaOldLink.json() as { code: string; message: string }).code).toBe("AUTH_CODE_SUPERSEDED");
    expect((viaOldLink.json() as { message: string }).message).toContain("latest");
    // A plain wrong code is still just invalid.
    const wrong = await verifyOtp(second.challengeId, first.debug.otp === "000000" ? "111111" : "000000");
    expect((wrong.json() as { code: string }).code).toBe("AUTH_INVALID_TOKEN");
    // The newest code works.
    const ok = await verifyOtp(second.challengeId, second.debug.otp);
    expect(ok.statusCode, ok.body).toBe(200);
  });

  it("a rejected send keeps the previous code valid (requires DB)", async () => {
    const email = `supersede-reject-${Date.now()}@iitbhu.ac.in`;
    const first = debugOf(await startAuth(email));
    await ageChallenge(first.challengeId);
    sendAuthEmailSpy.mockRejectedValueOnce(new Error("Resend delivery failed (422): bad"));
    const rejected = await startAuth(email);
    expect(rejected.statusCode).toBe(503);
    expect((rejected.json() as { code: string }).code).toBe("AUTH_DELIVERY_FAILED");
    const ok = await verifyOtp(first.challengeId, first.debug.otp);
    expect(ok.statusCode, ok.body).toBe(200);
  });
});

describe("email send classification", () => {
  it("only 'never connected' failures count as definitely not sent", () => {
    expect(neverConnected(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }))).toBe(true);
    expect(neverConnected(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }))).toBe(true);
    expect(neverConnected(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } }))).toBe(false);
    expect(neverConnected(new DOMException("The operation was aborted due to timeout", "TimeoutError"))).toBe(false);
    expect(neverConnected(null)).toBe(false);
  });
});
