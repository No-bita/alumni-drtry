import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { generateOpaqueToken, hashSecret } from "../src/lib/crypto.js";
import { SessionRepo } from "../src/repos/sessionRepo.js";
import { SESSION_COOKIE } from "./helpers/login.js";
import { TEST_DEGREE_ID_SQL, TEST_DEPARTMENT_ID_SQL } from "./helpers/identity.js";
import { referralNote } from "./helpers/note.js";

/**
 * One-page profile (migration 071): the profile shows the member's institute and the viewer's
 * reachout status, and "Reach out" on a profile records source "profile".
 * Requires a disposable test database (DATABASE_URL) with migrations through 073. No emails are sent:
 * members are seeded directly with sessions.
 */
type App = Awaited<ReturnType<typeof createApp>>;
const R = `${Date.now()}`;

describe("Profile page API (requires DB)", () => {
  let app: App;
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  type Member = { id: string; cookie: string };
  let n = 0;

  async function member(domain = "iitb.ac.in"): Promise<Member> {
    const row = await db.query<{ id: string }>(
      `INSERT INTO people (institutional_email, full_name, batch_year, department_id, degree_id, profile_completed_at, onboarding_completed_at)
       VALUES ($1, $2, 2019, ${TEST_DEPARTMENT_ID_SQL}, ${TEST_DEGREE_ID_SQL}, now(), now()) RETURNING id`,
      [`pp-${R}-${n++}@${domain}`, `Member ${n}`]
    );
    const token = generateOpaqueToken(48);
    await new SessionRepo(db).create({
      authMethod: "otp",
      personId: row.rows[0]!.id,
      sessionHash: hashSecret(token, env.AUTH_SECRET_PEPPER),
      expiresAt: new Date(Date.now() + 3_600_000),
      ipAddress: null,
      userAgent: null
    });
    return { id: row.rows[0]!.id, cookie: `${SESSION_COOKIE}=${token}` };
  }

  const req = (method: "GET" | "POST", url: string, who: Member, payload?: unknown) =>
    app.inject({ method, url, headers: { cookie: who.cookie }, ...(payload !== undefined ? { payload: payload as object } : {}) });

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app?.close();
    await db.end();
  });

  it("shows the institute, and the viewer's reachout once sent from the profile", async () => {
    const target = await member("iitb.ac.in");
    const viewer = await member("iitbhu.ac.in");
    const before = (await req("GET", `/v1/profiles/${target.id}`, viewer)).json() as { profile: { institutionName: string | null }; yourNote: string | null };
    expect(before.profile.institutionName).toBe("IIT Bombay");
    expect(before.yourNote).toBeNull();
    expect(JSON.stringify(before)).not.toContain("@iitb.ac.in");

    const sent = await req("POST", "/v1/contact-requests", viewer, { recipientPersonId: target.id, note: referralNote(), source: "profile" });
    expect(sent.statusCode, sent.body).toBe(201);
    const stored = await db.query<{ source: string; source_category: string | null }>(
      "SELECT source, source_category FROM contact_requests WHERE sender_person_id = $1 AND recipient_person_id = $2",
      [viewer.id, target.id]
    );
    expect(stored.rows[0]).toEqual({ source: "profile", source_category: "referral" });

    const after = (await req("GET", `/v1/profiles/${target.id}`, viewer)).json() as { yourNote: string | null };
    expect(after.yourNote).toBe("pending");
    const own = (await req("GET", `/v1/profiles/${target.id}`, target)).json() as { yourNote: string | null };
    expect(own.yourNote).toBeNull();
  });

  it("refuses an unknown source", async () => {
    const target = await member();
    const viewer = await member();
    const res = await req("POST", "/v1/contact-requests", viewer, { recipientPersonId: target.id, note: referralNote(), source: "elsewhere" });
    expect(res.statusCode).toBe(400);
  });
});
