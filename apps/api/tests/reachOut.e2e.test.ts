import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { loginForTest } from "./helpers/login.js";
import { adviceNote, referralNote } from "./helpers/note.js";

type App = Awaited<ReturnType<typeof createApp>>;

const run = Date.now();
const ORG = `Velmora${run}`;

describe("reach-out loop (integration)", () => {
  let app: App;
  let db: Pool;
  let asker: { cookie: string; personId: string };
  let alum: { cookie: string; personId: string };
  let other: { cookie: string; personId: string };

  const req = (method: "GET" | "POST" | "PATCH", url: string, cookie: string, payload?: object) =>
    app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    asker = await loginForTest(app, `reach-asker-${run}@iitbhu.ac.in`);
    alum = await loginForTest(app, `reach-alum-${run}@iitbhu.ac.in`);
    other = await loginForTest(app, `reach-other-${run}@iitbhu.ac.in`);
    const ft = (await db.query<{ id: string }>(`SELECT id FROM occupation_types WHERE code = 'full_time_employment'`)).rows[0]!.id;
    const org = (await db.query<{ id: string }>(`INSERT INTO organizations (name, approval_status) VALUES ($1, 'approved') RETURNING id`, [ORG])).rows[0]!.id;
    for (const [p, name] of [[asker, "Asker"], [alum, "Alum Person"], [other, "Other"]] as const) {
      await db.query(`UPDATE people SET full_name = $2, profile_completed_at = now() WHERE id = $1`, [p.personId, `${name} ${run}`]);
    }
    await db.query(
      `INSERT INTO occupations (person_id, occupation_type_id, organization_id, role_title, is_current) VALUES ($1, $2, $3, 'Product Manager', true)`,
      [alum.personId, ft, org]
    );
  });

  afterAll(async () => {
    await db?.end();
    await app?.close();
  });

  it("profile save with no tags clears them instead of failing", async () => {
    await db.query(`UPDATE people SET open_to_preferences = '{"selected":["coffee"],"descriptions":{}}' WHERE id = $1`, [asker.personId]);
    const res = await req("PATCH", "/v1/me/profile", asker.cookie, {
      residenceCity: "Pune",
      openToPreferences: { selected: [], descriptions: {} }
    });
    expect(res.statusCode, res.body).toBe(200);
    const row = (await db.query(`SELECT open_to_preferences, residence_city FROM people WHERE id = $1`, [asker.personId])).rows[0];
    expect(row.open_to_preferences).toBeNull();
    expect(row.residence_city).toBe("Pune");
  });

  it("records the source, blocks a second pending note, and lists sent notes", async () => {
    const send = () =>
      req("POST", "/v1/contact-requests", asker.cookie, {
        recipientPersonId: alum.personId,
        note: referralNote(),
        source: "match"
      });
    const first = await send();
    expect(first.statusCode, first.body).toBe(201);
    const second = await send();
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({
      code: "CONTACT_REQUEST_DUPLICATE_PENDING",
      message: `You already have a note waiting for Alum Person ${run}.`
    });

    const stored = (await db.query(`SELECT source, source_category FROM contact_requests WHERE sender_person_id = $1`, [asker.personId])).rows;
    expect(stored).toEqual([{ source: "match", source_category: "referral" }]);

    const sent = (await req("GET", "/v1/contact-requests/sent", asker.cookie)).json() as {
      requests: { recipientPersonId: string; status: string; recipientContactShared: string | null }[];
    };
    expect(sent.requests).toHaveLength(1);
    expect(sent.requests[0]).toMatchObject({ recipientPersonId: alum.personId, status: "pending", recipientContactShared: null });
  });

  it("match cards show the viewer's pending note", async () => {
    const res = await req("POST", "/v1/match", asker.cookie, { question: `referral for PM at ${ORG}` });
    const body = res.json() as { results: { id: string; yourNote: string | null; replyStats: unknown }[] };
    const card = body.results.find((r) => r.id === alum.personId)!;
    expect(card.yourNote).toBe("pending");
    expect(card.replyStats).toBeNull(); // only one note, below the 3-note threshold
  });

  it("after acceptance the sender sees the shared contact and can write again", async () => {
    const id = (await db.query<{ id: string }>(`SELECT id FROM contact_requests WHERE sender_person_id = $1`, [asker.personId])).rows[0]!.id;
    const accept = await req("PATCH", `/v1/contact-requests/${id}`, alum.cookie, { action: "accept" });
    expect(accept.statusCode, accept.body).toBe(200);
    const sent = (await req("GET", "/v1/contact-requests/sent", asker.cookie)).json() as {
      requests: { status: string; recipientContactShared: string | null }[];
    };
    expect(sent.requests[0]).toMatchObject({ status: "accepted", recipientContactShared: `reach-alum-${run}@iitbhu.ac.in` });
  });

  it("reply stats appear from three counted notes; fresh pending notes don't count", async () => {
    // alum now has 1 accepted (just now). Add: 1 declined after 2 days, 1 pending for 5 days (counts, unreplied),
    // 1 pending for 1 day (grace: not counted).
    const insert = (sender: string, status: string, ageDays: number, replyAfterDays: number | null) =>
      db.query(
        `INSERT INTO contact_requests (sender_person_id, recipient_person_id, message, status, forwarded_to_institutional_email, created_at, responded_at)
         VALUES ($1, $2, 'A note long enough', $3, 'x@iitbhu.ac.in', now() - ($4::int * interval '1 day'),
                 CASE WHEN $5::int IS NULL THEN NULL ELSE now() - ($4::int * interval '1 day') + ($5::int * interval '1 day') END)`,
        [sender, alum.personId, status, ageDays, replyAfterDays]
      );
    await insert(other.personId, "declined", 10, 2);
    await insert(other.personId, "pending", 5, null);
    await insert(other.personId, "pending", 1, null);
    const body = (await req("POST", "/v1/match", asker.cookie, { question: `referral for PM at ${ORG}` })).json() as {
      results: { id: string; yourNote: string | null; replyStats: { total: number; replied: number; medianDays: number | null } | null }[];
    };
    const card = body.results.find((r) => r.id === alum.personId)!;
    expect(card.yourNote).toBe("accepted");
    // Replies took ~0s and 2 days: median is just over 1 day, rounded up to 2.
    expect(card.replyStats).toEqual({ total: 3, replied: 2, medianDays: 2 });
  });

  it("reminds once, only for notes 3–14 days old", async () => {
    const mk = async (ageDays: number) =>
      (
        await db.query<{ id: string }>(
          `INSERT INTO contact_requests (sender_person_id, recipient_person_id, message, forwarded_to_institutional_email, created_at)
           VALUES ($1, $2, 'Reminder test note', 'x@iitbhu.ac.in', now() - ($3::numeric * interval '1 day')) RETURNING id`,
          [asker.personId, other.personId, ageDays]
        )
      ).rows[0]!.id;
    // Only one pending per pair is allowed through the API; insert directly to cover the age window.
    const tooNew = await mk(2.5);
    const due = await mk(4);
    const tooOld = await mk(20);
    const first = await app.contactRequestService.sendDueReminders();
    const second = await app.contactRequestService.sendDueReminders();
    const rows = (await db.query<{ id: string; reminder_sent_at: Date | null }>(
      `SELECT id, reminder_sent_at FROM contact_requests WHERE id = ANY($1::uuid[])`,
      [[tooNew, due, tooOld]]
    )).rows;
    const sentFor = (id: string) => rows.find((r) => r.id === id)!.reminder_sent_at !== null;
    expect(sentFor(due)).toBe(true);
    expect(sentFor(tooNew)).toBe(false);
    expect(sentFor(tooOld)).toBe(false);
    expect(first.sent).toBeGreaterThanOrEqual(1);
    expect(second.sent).toBe(0);
  });

  it("ask-match admin metrics are admin-only and count this run's notes", async () => {
    const forbidden = await req("GET", "/v1/admin/metrics/ask-match", asker.cookie);
    expect(forbidden.statusCode).toBe(403);
    await db.query(`UPDATE people SET role = 'admin' WHERE id = $1`, [other.personId]);
    const res = await req("GET", "/v1/admin/metrics/ask-match", other.cookie);
    expect(res.statusCode, res.body).toBe(200);
    const m = (res.json() as { metrics: { windowDays: number; total: { notesSent: number; notesAccepted: number }; byCategory: { category: string | null; notesSent: number }[]; profiles: { members: number } } }).metrics;
    expect(m.windowDays).toBe(30);
    expect(m.total.notesSent).toBeGreaterThanOrEqual(1);
    expect(m.total.notesAccepted).toBeGreaterThanOrEqual(1);
    expect(m.byCategory.find((c) => c.category === "referral")!.notesSent).toBeGreaterThanOrEqual(1);
    expect(m.profiles.members).toBeGreaterThanOrEqual(2);
  });
});
