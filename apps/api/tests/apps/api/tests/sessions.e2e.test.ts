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
});
