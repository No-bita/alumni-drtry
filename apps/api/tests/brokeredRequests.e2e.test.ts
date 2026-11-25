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
 * Brokered requests (migration 076), end to end: referral asks everyone at the company, the first yes
 * connects as an accepted reachout, the others are withdrawn, declines stay private, and requests
 * close after 2 days. Hiring asks members by function and experience (from graduation year).
 * Requires a disposable test database (DATABASE_URL) with migrations through 076. No emails are sent.
 */
type App = Awaited<ReturnType<typeof createApp>>;
const R = `${Date.now()}`;

describe("Brokered requests (requires DB)", () => {
  let app: App;
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  type Member = { id: string; cookie: string };
  let n = 0;
  let fullTime = "";

  async function member(opts: { batch?: number; jobFunction?: string | null } = {}): Promise<Member> {
    const row = await db.query<{ id: string }>(
      `INSERT INTO people (institutional_email, full_name, batch_year, department_id, degree_id, profile_completed_at, onboarding_completed_at, job_function)
       VALUES ($1, $2, $3, ${TEST_DEPARTMENT_ID_SQL}, ${TEST_DEGREE_ID_SQL}, now(), now(), $4) RETURNING id`,
      [`br-${R}-${n++}@iitbhu.ac.in`, `Broker ${R} ${n}`, opts.batch ?? 2019, opts.jobFunction ?? null]
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

  async function worksAt(who: Member, orgId: string) {
    await db.query(`INSERT INTO occupations (person_id, occupation_type_id, organization_id, role_title, is_current) VALUES ($1, $2, $3, 'Engineer', true)`, [
      who.id,
      fullTime,
      orgId
    ]);
  }

  const req = (method: "GET" | "POST" | "PUT", url: string, who: Member, payload?: unknown) =>
    app.inject({ method, url, headers: { cookie: who.cookie }, ...(payload !== undefined ? { payload: payload as object } : {}) });

  beforeAll(async () => {
    app = await createApp();
    fullTime = (await db.query<{ id: string }>(`SELECT id FROM occupation_types WHERE code = 'full_time_employment'`)).rows[0]!.id;
  });
  afterAll(async () => {
    await app?.close();
    await db.end();
  });

  it("referral: asks everyone at the company, first yes connects, the rest are withdrawn", async () => {
    const org = (await db.query<{ id: string }>(`INSERT INTO organizations (name, approval_status) VALUES ($1, 'approved') RETURNING id`, [`Brokerco ${R}`])).rows[0]!.id;
    const asker = await member();
    const [h1, h2, h3] = [await member(), await member(), await member()];
    for (const h of [h1, h2, h3]) await worksAt(h, org);

    const eligible = (await req("GET", `/v1/broker-requests/referral-eligible?company=${encodeURIComponent(`brokerco ${R}`)}`, asker)).json();
    expect(eligible).toEqual({ company: `Brokerco ${R}`, count: 3 });

    const created = await req("POST", "/v1/broker-requests", asker, { kind: "referral", jobFunction: "product", note: referralNote({ company: `brokerco ${R}` }) });
    expect(created.statusCode, created.body).toBe(201);
    const request = created.json().request as { id: string; askedCount: number; status: string; company: string };
    expect(request).toMatchObject({ askedCount: 3, status: "open", company: `Brokerco ${R}` });

    const asksFor = async (who: Member) => (await req("GET", "/v1/broker-asks", who)).json().asks as Array<{ askId: string; status: string; conversation: unknown }>;
    const [a1] = await asksFor(h1);
    const [a2] = await asksFor(h2);
    const [a3] = await asksFor(h3);

    expect((await req("POST", `/v1/broker-asks/${a1!.askId}/seen`, h1)).statusCode).toBe(204);
    expect((await req("POST", `/v1/broker-asks/${a1!.askId}/respond`, h1, { action: "decline" })).json().status).toBe("declined");

    const yes = await req("POST", `/v1/broker-asks/${a2!.askId}/respond`, h2, { action: "accept" });
    expect(yes.statusCode, yes.body).toBe(200);
    expect(yes.json()).toEqual({ status: "connected", requestId: request.id, askerName: expect.any(String) });

    const late = await req("POST", `/v1/broker-asks/${a3!.askId}/respond`, h3, { action: "accept" });
    expect(late.statusCode).toBe(409);
    expect(late.json().code).toBe("BROKER_ALREADY_HELPED");

    const mine = (await req("GET", "/v1/broker-requests", asker)).json().requests[0];
    expect(mine).toMatchObject({ status: "connected", seenCount: 1, connection: { personId: h2.id } });
    // No contact is shared on a yes: the two of them talk in the request's conversation.
    expect(mine.connection).toEqual({ personId: h2.id, fullName: expect.any(String) });
    expect(mine.conversation).toMatchObject({ state: "open", unreadCount: 0 });
    expect(JSON.stringify(mine)).not.toContain("@");
    // The asker never sees who declined or who else was asked.
    expect(JSON.stringify(mine)).not.toContain(h1.id);
    expect(JSON.stringify(mine)).not.toContain(h3.id);

    const reachout = await db.query(`SELECT status, source, source_category FROM contact_requests WHERE sender_person_id = $1 AND recipient_person_id = $2`, [asker.id, h2.id]);
    expect(reachout.rows[0]).toEqual({ status: "accepted", source: "referral_request", source_category: "referral" });
    const helperView = (await asksFor(h2))[0]!;
    expect(helperView).toMatchObject({ status: "accepted", conversation: { state: "open" } });
    expect(JSON.stringify(helperView)).not.toContain("@");
    expect(await asksFor(h3)).toEqual([]);
  });

  it("referral: told up front when nobody is at the company", async () => {
    const asker = await member();
    const res = await req("POST", "/v1/broker-requests", asker, { kind: "referral", jobFunction: "tech", note: referralNote({ company: `Nobodyco ${R}` }) });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("BROKER_NO_ALUMNI");
  });

  it("closes after 2 days with no yes, and tells the asker in the app", async () => {
    const org = (await db.query<{ id: string }>(`INSERT INTO organizations (name, approval_status) VALUES ($1, 'approved') RETURNING id`, [`Quietco ${R}`])).rows[0]!.id;
    const asker = await member();
    const helper = await member();
    await worksAt(helper, org);
    const created = (await req("POST", "/v1/broker-requests", asker, { kind: "referral", jobFunction: "ops", note: referralNote({ company: `Quietco ${R}` }) })).json().request;
    await db.query(`UPDATE broker_requests SET expires_at = now() - interval '1 minute' WHERE id = $1`, [created.id]);
    expect((await req("GET", "/v1/broker-requests", asker)).json().requests[0].status).toBe("expired");
    const notes = (await req("GET", "/v1/notifications", asker)).json() as { items: Array<{ kind: string; requestId?: string }> };
    expect(notes.items.some((i) => i.kind === "broker_request_expired" && i.requestId === created.id)).toBe(true);
    expect(await (await req("GET", "/v1/broker-asks", helper)).json().asks).toEqual([]);
  });

  it("hiring: asks members with the post's function and experience, from the poster's own post", async () => {
    const now = new Date().getUTCFullYear();
    const poster = await member();
    const match = await member({ jobFunction: "product", batch: now - 4 });
    const wrongFunction = await member({ jobFunction: "sales", batch: now - 4 });
    const wrongLevel = await member({ jobFunction: "product", batch: now - 10 });
    const post = await req("POST", "/v1/intentcasts", poster, {
      category: "hiring",
      content: "Small payments team, you'd own the refunds flow end to end. Reach out with what you've shipped.",
      hiring: { jobFunction: "product", roleTitle: "Product Manager", experience: "3_7", location: "Bengaluru", company: `Hireco ${R}`, respondVia: "reachout" }
    });
    expect(post.statusCode, post.body).toBe(201);
    const intentcast = post.json().intentcast as { id: string; hiring: { jobFunction: string; experience: string } };
    expect(intentcast.hiring).toMatchObject({ jobFunction: "product", experience: "3_7", respondVia: "reachout" });

    const asked = await req("POST", "/v1/broker-requests", poster, { kind: "hiring", intentcastId: intentcast.id });
    expect(asked.statusCode, asked.body).toBe(201);
    const asks = async (who: Member) => (await req("GET", "/v1/broker-asks", who)).json().asks as unknown[];
    expect(await asks(match)).toHaveLength(1);
    expect(await asks(wrongFunction)).toHaveLength(0);
    expect(await asks(wrongLevel)).toHaveLength(0);

    const again = await req("POST", "/v1/broker-requests", poster, { kind: "hiring", intentcastId: intentcast.id });
    expect(again.statusCode).toBe(409);
  });

  it("hiring from Ask: asks matching members privately with no Wall post; one open per function and level", async () => {
    const now = new Date().getUTCFullYear();
    const hirer = await member();
    const match = await member({ jobFunction: "data", batch: now - 2 });
    const role = { jobFunction: "data", experience: "0_3", roleTitle: "Data Analyst", company: `Hireco ${R}`, message: "Small analytics team; you'd own the weekly business review." };
    const asked = await req("POST", "/v1/broker-requests", hirer, { kind: "hiring", role });
    expect(asked.statusCode, asked.body).toBe(201);
    expect(asked.json().request).toMatchObject({ kind: "hiring", intentcastId: null, jobFunction: "data", experienceBand: "0_3", roleTitle: "Data Analyst" });
    const asks = (await req("GET", "/v1/broker-asks", match)).json().asks as Array<{ kind: string; message: string; company: string }>;
    expect(asks).toEqual([expect.objectContaining({ kind: "hiring", company: `Hireco ${R}`, message: role.message })]);
    expect((await req("POST", "/v1/broker-requests", hirer, { kind: "hiring", role })).statusCode).toBe(409);
    // Exactly one of a post or a role.
    expect((await req("POST", "/v1/broker-requests", hirer, { kind: "hiring" })).statusCode).toBe(400);
  });

  it("hiring posts need an apply link when people should apply via link", async () => {
    const poster = await member();
    const res = await req("POST", "/v1/intentcasts", poster, {
      category: "hiring",
      content: "Growing the design team in Pune; portfolio reviews this month.",
      hiring: { jobFunction: "design", experience: "0_3", respondVia: "link" }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("INTENTCAST_APPLY_LINK_REQUIRED");
  });

  it("job function: one tap on the profile", async () => {
    const who = await member();
    expect((await req("PUT", "/v1/me/job-function", who, { jobFunction: "data" })).json()).toEqual({ jobFunction: "data" });
    expect((await req("GET", "/v1/me/profile", who)).json().profile.jobFunction).toBe("data");
    expect((await req("PUT", "/v1/me/job-function", who, { jobFunction: "astronaut" })).statusCode).toBe(400);
  });
});
