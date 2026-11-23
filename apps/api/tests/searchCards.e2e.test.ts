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
 * Search cards (migrations 074, 075): results carry the member's institute, "Reach out" on a card
 * records source "search", and the reachout status is looked up only when asked.
 * Requires a disposable test database (DATABASE_URL) with migrations through 075. No emails are sent:
 * members are seeded directly with sessions.
 */
type App = Awaited<ReturnType<typeof createApp>>;
const R = `${Date.now()}`;

describe("Search cards API (requires DB)", () => {
  let app: App;
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  type Member = { id: string; cookie: string };
  let n = 0;

  async function member(domain = "iitb.ac.in"): Promise<Member> {
    const row = await db.query<{ id: string }>(
      `INSERT INTO people (institutional_email, full_name, batch_year, department_id, degree_id, profile_completed_at, onboarding_completed_at)
       VALUES ($1, $2, 2019, ${TEST_DEPARTMENT_ID_SQL}, ${TEST_DEGREE_ID_SQL}, now(), now()) RETURNING id`,
      [`sc-${R}-${n++}@${domain}`, `Searchcard ${R} ${n}`]
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

  it("search results carry the institute and never the email", async () => {
    const target = await member("iitb.ac.in");
    const viewer = await member("iitbhu.ac.in");
    const res = await req("GET", `/v1/search?q=${encodeURIComponent(`Searchcard ${R}`)}&limit=20`, viewer);
    expect(res.statusCode, res.body).toBe(200);
    const hit = (res.json() as { results: { id: string; institutionName?: string | null }[] }).results.find((r) => r.id === target.id);
    expect(hit?.institutionName).toBe("IIT Bombay");
    expect(res.body).not.toContain("@iitb.ac.in");
    expect(res.body).not.toContain('"bio"');
  });

  it("records a reachout from search, and the status endpoint reports it", async () => {
    const target = await member();
    const viewer = await member();
    const status = async (who: Member, id: string) => (await req("GET", `/v1/contact-requests/status?recipientPersonId=${id}`, who)).json() as { yourNote: string | null };
    expect(await status(viewer, target.id)).toEqual({ yourNote: null });

    const sent = await req("POST", "/v1/contact-requests", viewer, { recipientPersonId: target.id, note: referralNote(), source: "search" });
    expect(sent.statusCode, sent.body).toBe(201);
    const stored = await db.query<{ source: string; source_category: string | null }>(
      "SELECT source, source_category FROM contact_requests WHERE sender_person_id = $1 AND recipient_person_id = $2",
      [viewer.id, target.id]
    );
    expect(stored.rows[0]).toEqual({ source: "search", source_category: "referral" });

    expect(await status(viewer, target.id)).toEqual({ yourNote: "pending" });
    expect(await status(target, target.id)).toEqual({ yourNote: null });
    expect(await status(target, viewer.id)).toEqual({ yourNote: null });
  });

  it("the people table no longer has a bio", async () => {
    const cols = await db.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'people' AND column_name = 'bio'");
    expect(cols.rowCount).toBe(0);
  });
});
