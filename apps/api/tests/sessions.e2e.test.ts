import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { generateOpaqueToken, hashSecret } from "../src/lib/crypto.js";
import { SessionRepo } from "../src/repos/sessionRepo.js";
import { loginForTest, SESSION_COOKIE } from "./helpers/login.js";

type App = Awaited<ReturnType<typeof createApp>>;
const run = Date.now();

describe("sessions: stay signed in, sign out of all devices (integration)", () => {
  let app: App;
  let db: Pool;
  beforeAll(async () => {
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
  });
  afterAll(async () => {
    await db?.end();
    await app?.close();
  });

  const me = (cookie: string) => app.inject({ method: "GET", url: "/v1/me", headers: { cookie } });

  it("a new sign-in lasts 7 days without a visit, and the cookie 30 days at most", async () => {
    const a = await loginForTest(app, `sess-a-${run}@iitbhu.ac.in`);
    const row = (await db.query<{ hours: number }>(
      `SELECT EXTRACT(EPOCH FROM (expires_at - created_at)) / 3600 AS hours FROM sessions WHERE person_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [a.personId],
    )).rows[0]!;
    expect(Math.round(Number(row.hours))).toBe(24 * 7);
    expect(env.SESSION_HARD_CAP_HOURS).toBe(24 * 30);
  });

  it("signing out of all devices ends every session of that member, and only theirs", async () => {
    const a = await loginForTest(app, `sess-b-${run}@iitbhu.ac.in`);
    const other = await loginForTest(app, `sess-c-${run}@iitbhu.ac.in`);
    // The same member signed in on a second device.
    const token = generateOpaqueToken(48);
    await new SessionRepo(db).create({
      authMethod: "otp",
      personId: a.personId,
      sessionHash: hashSecret(token, env.AUTH_SECRET_PEPPER),
      expiresAt: new Date(Date.now() + 3_600_000),
      ipAddress: null,
      userAgent: null,
    });
    const phone = `${SESSION_COOKIE}=${token}`;
    expect((await me(phone)).statusCode).toBe(200);

    const res = await app.inject({ method: "POST", url: "/v1/auth/logout-all", headers: { cookie: a.cookie } });
    expect(res.statusCode).toBe(204);
    expect(String(res.headers["set-cookie"])).toContain(`${SESSION_COOKIE}=;`);
    expect((await me(a.cookie)).statusCode).toBe(401);
    expect((await me(phone)).statusCode).toBe(401);
    expect((await me(other.cookie)).statusCode).toBe(200);
  });

  it("needs a signed-in member", async () => {
    expect((await app.inject({ method: "POST", url: "/v1/auth/logout-all" })).statusCode).toBe(401);
  });

  const sessionRow = async (personId: string) => (await db.query<{
    id: string; expires_at: Date; created_at: Date; last_seen_at: Date; revoked_at: Date | null;
  }>("SELECT id, expires_at, created_at, last_seen_at, revoked_at FROM sessions WHERE person_id=$1 ORDER BY created_at DESC LIMIT 1", [personId])).rows[0]!;

  it("issues the actual 30-day HttpOnly cookie at sign-in", async () => {
    const start = await app.inject({ method: "POST", url: "/v1/auth/start", payload: { institutionalEmail: `sess-cookie-${run}@iitbhu.ac.in` } });
    expect(start.statusCode).toBe(200);
    const link = new URL(start.json().debug.magicLinkUrl);
    const verify = await app.inject({ method: "GET", url: `/v1/auth/verify?challengeId=${encodeURIComponent(link.searchParams.get("challengeId")!)}&magicLinkToken=${encodeURIComponent(link.searchParams.get("magicLinkToken")!)}` });
    expect(verify.statusCode).toBe(200);
    const header = String(verify.headers["set-cookie"]);
    expect(header).toContain("Max-Age=2592000");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Path=/");
  });

  it("does not revive an idle-expired session", async () => {
    const a = await loginForTest(app, `sess-idle-${run}@iitbhu.ac.in`);
    await db.query("UPDATE sessions SET expires_at=now()-interval '1 second', last_seen_at=now()-interval '8 days' WHERE person_id=$1", [a.personId]);
    const before = await sessionRow(a.personId);
    expect((await me(a.cookie)).statusCode).toBe(401);
    expect((await sessionRow(a.personId)).expires_at.getTime()).toBe(before.expires_at.getTime());
  });

  it("extends an active old session, without reissuing its browser cookie, and throttles the next touch", async () => {
    const a = await loginForTest(app, `sess-roll-${run}@iitbhu.ac.in`);
    await db.query("UPDATE sessions SET expires_at=now()+interval '1 hour', last_seen_at=now()-interval '5 minutes' WHERE person_id=$1", [a.personId]);
    const response = await me(a.cookie);
    expect(response.statusCode).toBe(200);
    expect(response.headers["set-cookie"]).toBeUndefined();
    const first = await sessionRow(a.personId);
    expect(Math.abs(first.expires_at.getTime() - Date.now() - 168 * 3600000)).toBeLessThan(30000);
    expect((await me(a.cookie)).statusCode).toBe(200);
    const second = await sessionRow(a.personId);
    expect(second.expires_at.getTime()).toBe(first.expires_at.getTime());
    expect(second.last_seen_at.getTime()).toBe(first.last_seen_at.getTime());
  });

  it("caps activity extension at the original creation time plus 30 days", async () => {
    const a = await loginForTest(app, `sess-cap-${run}@iitbhu.ac.in`);
    await db.query("UPDATE sessions SET created_at=now()-interval '29 days', expires_at=now()+interval '1 hour', last_seen_at=now()-interval '5 minutes' WHERE person_id=$1", [a.personId]);
    expect((await me(a.cookie)).statusCode).toBe(200);
    const row = await sessionRow(a.personId);
    expect(Math.abs(row.expires_at.getTime() - row.created_at.getTime() - 720 * 3600000)).toBeLessThan(10);
  });

  it("rejects a hard-cap-expired session even if its stored idle expiry is in the future", async () => {
    const a = await loginForTest(app, `sess-hard-${run}@iitbhu.ac.in`);
    await db.query("UPDATE sessions SET created_at=now()-interval '30 days 1 second', expires_at=now()+interval '1 day' WHERE person_id=$1", [a.personId]);
    expect((await me(a.cookie)).statusCode).toBe(401);
  });

  it("uses configured limits for sliding extension and still respects the configured hard cap", async () => {
    const a = await loginForTest(app, `sess-settings-${run}@iitbhu.ac.in`);
    const original = { sliding: env.SESSION_SLIDING_HOURS, cap: env.SESSION_HARD_CAP_HOURS };
    try {
      env.SESSION_SLIDING_HOURS = 1;
      env.SESSION_HARD_CAP_HOURS = 2;
      await db.query("UPDATE sessions SET expires_at=now()+interval '5 minutes', last_seen_at=now()-interval '5 minutes' WHERE person_id=$1", [a.personId]);
      expect((await me(a.cookie)).statusCode).toBe(200);
      expect(Math.abs((await sessionRow(a.personId)).expires_at.getTime() - Date.now() - 3600000)).toBeLessThan(30000);
      await db.query("UPDATE sessions SET created_at=now()-interval '90 minutes', expires_at=now()+interval '5 minutes', last_seen_at=now()-interval '5 minutes' WHERE person_id=$1", [a.personId]);
      expect((await me(a.cookie)).statusCode).toBe(200);
      const row = await sessionRow(a.personId);
      expect(Math.abs(row.expires_at.getTime() - row.created_at.getTime() - 2 * 3600000)).toBeLessThan(10);
    } finally {
      env.SESSION_SLIDING_HOURS = original.sliding;
      env.SESSION_HARD_CAP_HOURS = original.cap;
    }
  });

  it("does not revive a revoked token, but permits a new legitimate sign-in", async () => {
    const email = `sess-revoke-${run}@iitbhu.ac.in`;
    const a = await loginForTest(app, email);
    expect((await app.inject({ method: "POST", url: "/v1/auth/logout-all", headers: { cookie: a.cookie, origin: env.APP_BASE_URL } })).statusCode).toBe(204);
    const revoked = await sessionRow(a.personId);
    expect(revoked.revoked_at).not.toBeNull();
    expect((await me(a.cookie)).statusCode).toBe(401);
    expect((await me(a.cookie)).statusCode).toBe(401);
    expect((await sessionRow(a.personId)).expires_at.getTime()).toBe(revoked.expires_at.getTime());
    const fresh = await loginForTest(app, email);
    expect((await me(fresh.cookie)).statusCode).toBe(200);
    expect((await me(a.cookie)).statusCode).toBe(401);
  });

  it("rejects a cross-origin logout-all without revoking the member's session", async () => {
    const a = await loginForTest(app, `sess-origin-${run}@iitbhu.ac.in`);
    const response = await app.inject({ method: "POST", url: "/v1/auth/logout-all", headers: { cookie: a.cookie, origin: "https://untrusted.invalid" } });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("CSRF_FORBIDDEN");
    expect((await me(a.cookie)).statusCode).toBe(200);
    expect((await sessionRow(a.personId)).revoked_at).toBeNull();
  });

  it("rejects a demo account without revoking its session", async () => {
    const a = await loginForTest(app, `sess-demo-${run}@iitbhu.ac.in`);
    const oldEnabled = env.DEMO_AUTH_ENABLED;
    try {
      env.DEMO_AUTH_ENABLED = true;
      await db.query("UPDATE people SET is_demo=true WHERE id=$1", [a.personId]);
      const response = await app.inject({ method: "POST", url: "/v1/auth/logout-all", headers: { cookie: a.cookie, origin: env.APP_BASE_URL } });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe("DEMO_READ_ONLY");
      expect((await sessionRow(a.personId)).revoked_at).toBeNull();
      expect((await me(a.cookie)).statusCode).toBe(200);
    } finally {
      await db.query("UPDATE people SET is_demo=false WHERE id=$1", [a.personId]);
      env.DEMO_AUTH_ENABLED = oldEnabled;
    }
  });

});
