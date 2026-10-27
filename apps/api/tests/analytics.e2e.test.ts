import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { ConsoleEmailSender, EmailDeliveryUnconfirmedError } from "../src/services/emailSender.js";
import { sanitizeEventMetadata, UsageEventRateLimiter } from "../src/lib/betaUsageEventTypes.js";
import type { AnalyticsReport } from "../src/repos/analyticsRepo.js";
import { loginForTest } from "./helpers/login.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Who = { cookie: string; personId: string };

const run = Date.now();
const ORG = `Analytix${run}`;

describe("GET /v1/admin/analytics (integration)", () => {
  let app: App;
  let db: Pool;
  let admin: Who;
  let member: Who;
  let asker: Who;
  let alum: Who;
  let other: Who;
  let before: AnalyticsReport;
  let after: AnalyticsReport;

  const get = (url: string, cookie?: string) =>
    app.inject({ method: "GET", url, ...(cookie ? { headers: { cookie } } : {}) });
  const post = (url: string, cookie: string, payload: object) =>
    app.inject({ method: "POST", url, headers: { cookie }, payload });
  const report = async (days = 30) => {
    const res = await get(`/v1/admin/analytics?days=${days}&fresh=1`, admin.cookie);
    expect(res.statusCode, res.body).toBe(200);
    return (res.json() as { report: AnalyticsReport }).report;
  };

  beforeAll(async () => {
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    admin = await loginForTest(app, `an-admin-${run}@iitbhu.ac.in`);
    member = await loginForTest(app, `an-member-${run}@iitbhu.ac.in`);
    asker = await loginForTest(app, `an-asker-${run}@iitbhu.ac.in`);
    alum = await loginForTest(app, `an-alum-${run}@iitbhu.ac.in`);
    other = await loginForTest(app, `an-other-${run}@iitbhu.ac.in`);
    await db.query(`UPDATE people SET role = 'admin' WHERE id = $1`, [admin.personId]);
    for (const [p, name] of [[asker, "Asker"], [alum, "Alum"], [other, "Other"]] as const) {
      await db.query(`UPDATE people SET full_name = $2, profile_completed_at = now() WHERE id = $1`, [p.personId, `${name} ${run}`]);
    }
    await db.query(`UPDATE people SET open_to_preferences = $2::jsonb WHERE id = $1`, [
      alum.personId,
      JSON.stringify({ selected: ["referrals"], descriptions: {} }),
    ]);
    const ft = (await db.query<{ id: string }>(`SELECT id FROM occupation_types WHERE code = 'full_time_employment'`)).rows[0]!.id;
    const org = (await db.query<{ id: string }>(`INSERT INTO organizations (name, approval_status) VALUES ($1, 'approved') RETURNING id`, [ORG])).rows[0]!.id;
    await db.query(
      `INSERT INTO occupations (person_id, occupation_type_id, organization_id, role_title, is_current) VALUES ($1, $2, $3, 'Engineer', true)`,
      [alum.personId, ft, org]
    );

    before = await report();

    // Notes: one accepted within a day (from result #1), one declined (from result #2).
    const note = (to: string, status: string, rank: number, createdDaysAgo: number) =>
      db.query(
        `INSERT INTO contact_requests (sender_person_id, recipient_person_id, message, forwarded_to_institutional_email,
                                       status, created_at, responded_at, recipient_contact_shared, source, source_category, source_rank)
         VALUES ($1, $2, 'hello', 'x@iitbhu.ac.in', $3, now() - ($4::int * interval '1 day'),
                 now() - (($4::int - 1) * interval '1 day'), CASE WHEN $3 = 'accepted' THEN 'me@example.com' END,
                 'match', 'referral', $5)`,
        [asker.personId, to, status, createdDaysAgo, rank]
      );
    await note(alum.personId, "accepted", 1, 2);
    await note(other.personId, "declined", 2, 3);

    // Two questions about the org: one found someone, one found nobody.
    await db.query(
      `INSERT INTO match_queries (category, detected_fields, parser_source, result_count, had_overrides, needs_detail, company)
       VALUES ('referral', '{company}', 'rules', 1, false, false, $1), ('referral', '{company}', 'rules', 0, false, false, $1)`,
      [ORG]
    );

    // Usage events: a Home browse tap (free text in metadata must be dropped) and an event that is not recorded.
    expect((await post("/v1/analytics/beta-usage-event", member.cookie, {
      eventType: "home_browse_clicked", route: "/home?x=1", metadata: { link: "careers", q: "my secret question" },
    })).statusCode).toBe(202);
    expect((await post("/v1/analytics/beta-usage-event", member.cookie, {
      eventType: "thread_created", route: "/threads",
    })).statusCode).toBe(202);

    // A new member who arrived through a WhatsApp invite from the alum.
    const newcomer = await loginForTest(app, `an-new-${run}@iitbhu.ac.in`);
    expect((await post("/v1/me/invited-by", newcomer.cookie, { ref: alum.personId, channel: "whatsapp" })).statusCode).toBe(204);

    // A sign-in email that was clearly rejected.
    const spy = vi.spyOn(ConsoleEmailSender.prototype, "sendAuthEmail").mockRejectedValueOnce(new Error("Resend delivery failed (422)"));
    expect((await post("/v1/auth/start", "", { institutionalEmail: `an-fail-${run}@iitbhu.ac.in` })).statusCode).toBe(503);
    spy.mockRestore();

    after = await report();
  });

  afterAll(async () => {
    await db?.end();
    await app?.close();
  });

  it("is for admins only, and validates the window", async () => {
    expect((await get("/v1/admin/analytics")).statusCode).toBe(401);
    expect((await get("/v1/admin/analytics", member.cookie)).statusCode).toBe(403);
    expect((await get("/v1/admin/analytics?days=14", admin.cookie)).statusCode).toBe(400);
    for (const d of [7, 30, 90]) expect((await report(d)).windowDays).toBe(d);
  });

  it("caches each window for 5 minutes unless asked for fresh numbers", async () => {
    const a = (await get("/v1/admin/analytics?days=7", admin.cookie)).json() as { report: AnalyticsReport };
    const b = (await get("/v1/admin/analytics?days=7", admin.cookie)).json() as { report: AnalyticsReport };
    expect(b.report.generatedAt).toBe(a.report.generatedAt);
  });

  it("north star: accepted notes and the 7-day help rate", () => {
    expect(after.northStar.acceptedNotes - before.northStar.acceptedNotes).toBe(1);
    expect(after.northStar.askers - before.northStar.askers).toBe(1);
    expect(after.northStar.helpedWithin7Days - before.northStar.helpedWithin7Days).toBe(1);
    expect(after.northStar.trendAccepted).toHaveLength(12);
  });

  it("outcomes and matching quality by result position", () => {
    expect(after.outcomes.sent - before.outcomes.sent).toBe(2);
    expect(after.outcomes.accepted - before.outcomes.accepted).toBe(1);
    expect(after.outcomes.declined - before.outcomes.declined).toBe(1);
    const rank = (r: AnalyticsReport, k: number) => r.matching.byRank.find((x) => x.rank === k) ?? { notes: 0, accepted: 0, declined: 0 };
    expect(rank(after, 1).accepted - rank(before, 1).accepted).toBe(1);
    expect(rank(after, 2).declined - rank(before, 2).declined).toBe(1);
    const cat = (r: AnalyticsReport) => r.matching.byCategory.find((x) => x.category === "referral") ?? { notes: 0, accepted: 0 };
    expect(cat(after).notes - cat(before).notes).toBe(2);
    expect(cat(after).accepted - cat(before).accepted).toBe(1);
  });

  it("asking, and demand compared with supply for what was asked", () => {
    expect(after.asking.questions - before.asking.questions).toBe(2);
    expect(after.asking.zeroResults - before.asking.zeroResults).toBe(1);
    const row = after.demandSupply.top.find((r) => r.company === ORG);
    expect(row).toMatchObject({ category: "referral", questions: 2, zeroResults: 1, supply: 1, supplyOffering: 1 });
    expect(after.demandSupply.byCategory.map((c) => c.category)).toContain("referral");
  });

  it("records only approved events, with free text stripped", async () => {
    expect(after.engagement.home.find((h) => h.event === "home_browse_clicked")!.count -
      before.engagement.home.find((h) => h.event === "home_browse_clicked")!.count).toBe(1);
    const stored = (await db.query<{ event_type: string; route: string; metadata: Record<string, unknown> }>(
      `SELECT event_type, route, metadata FROM beta_usage_events WHERE person_id = $1`, [member.personId])).rows;
    expect(stored).toEqual([{ event_type: "home_browse_clicked", route: "/home", metadata: { link: "careers" } }]);
  });

  it("operations: the directory split by kind of account", () => {
    const d = after.operations.directory;
    expect(d.total).toBeGreaterThanOrEqual(d.real + d.demo + d.test);
    expect(d.real - before.operations.directory.real).toBe(1);
  });

  it("growth: invited sign-ups by channel; sign-in: failed sends and methods", () => {
    expect(after.growth.invitedSignups.whatsapp - before.growth.invitedSignups.whatsapp).toBe(1);
    expect(after.signIn.failedRejected - before.signIn.failedRejected).toBe(1);
    expect((after.signIn.sessionsByMethod.magic_link ?? 0) - (before.signIn.sessionsByMethod.magic_link ?? 0)).toBe(1);
    expect(after.signIn.newMembers - before.signIn.newMembers).toBe(1);
    expect(after.engagement.activeMembers).toBeGreaterThan(before.engagement.activeMembers);
  });
});

describe("invite attribution rules", () => {
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
  const claim = (cookie: string, ref: string, channel = "copy") =>
    app.inject({ method: "POST", url: "/v1/me/invited-by", headers: { cookie }, payload: { ref, channel } });
  const invitedBy = async (id: string) =>
    (await db.query<{ invited_by_person_id: string | null }>(`SELECT invited_by_person_id FROM people WHERE id = $1`, [id])).rows[0]!
      .invited_by_person_id;

  it("first claim wins; no self-invites; only for brand-new members", async () => {
    const inviter = await loginForTest(app, `inv-a-${run}@iitbhu.ac.in`);
    const second = await loginForTest(app, `inv-b-${run}@iitbhu.ac.in`);
    const fresh = await loginForTest(app, `inv-c-${run}@iitbhu.ac.in`);
    expect((await claim(fresh.cookie, fresh.personId)).statusCode).toBe(204);
    expect(await invitedBy(fresh.personId)).toBeNull();
    await claim(fresh.cookie, inviter.personId);
    await claim(fresh.cookie, second.personId);
    expect(await invitedBy(fresh.personId)).toBe(inviter.personId);

    const old = await loginForTest(app, `inv-d-${run}@iitbhu.ac.in`);
    await db.query(`UPDATE people SET created_at = now() - interval '3 days' WHERE id = $1`, [old.personId]);
    await claim(old.cookie, inviter.personId);
    expect(await invitedBy(old.personId)).toBeNull();
    expect((await claim(old.cookie, "not-a-uuid")).statusCode).toBe(204);
  });
});

describe("sign-in records how the email went", () => {
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
  const delivery = async (email: string) =>
    (await db.query<{ delivery: string | null }>(`SELECT delivery FROM auth_challenges WHERE institutional_email = $1`, [email])).rows[0]
      ?.delivery;

  it("sent vs unconfirmed, and the OTP sign-in method on the session", async () => {
    const sentEmail = `del-sent-${run}@iitbhu.ac.in`;
    const start = await app.inject({ method: "POST", url: "/v1/auth/start", payload: { institutionalEmail: sentEmail } });
    expect(await delivery(sentEmail)).toBe("sent");
    const { challengeId, debug } = start.json() as { challengeId: string; debug: { otp: string } };
    const verified = await app.inject({ method: "POST", url: "/v1/auth/verify", payload: { challengeId, otp: debug.otp } });
    expect(verified.statusCode, verified.body).toBe(200);
    const method = (await db.query<{ auth_method: string }>(
      `SELECT s.auth_method FROM sessions s JOIN people p ON p.id = s.person_id WHERE p.institutional_email = $1`, [sentEmail])).rows[0]!;
    expect(method.auth_method).toBe("otp");

    const slowEmail = `del-slow-${run}@iitbhu.ac.in`;
    const spy = vi.spyOn(ConsoleEmailSender.prototype, "sendAuthEmail").mockRejectedValueOnce(new EmailDeliveryUnconfirmedError("timeout"));
    await app.inject({ method: "POST", url: "/v1/auth/start", payload: { institutionalEmail: slowEmail } });
    spy.mockRestore();
    expect(await delivery(slowEmail)).toBe("unconfirmed");
  });
});

describe("usage event guards", () => {
  it("keeps only short, known metadata", () => {
    expect(
      sanitizeEventMetadata({ link: "careers", q: "free text", step: 2, stage: "profile", questionIndex: 3, long: "x", source: "x".repeat(65) }),
    ).toEqual({ link: "careers", stage: "profile", questionIndex: 3 });
    expect(sanitizeEventMetadata(undefined)).toEqual({});
  });
  it("caps each person per minute", () => {
    let t = 0;
    const limiter = new UsageEventRateLimiter(3, () => t);
    expect([1, 2, 3, 4].map(() => limiter.allow("p"))).toEqual([true, true, true, false]);
    expect(limiter.allow("q")).toBe(true);
    t += 60_000;
    expect(limiter.allow("p")).toBe(true);
  });
});
