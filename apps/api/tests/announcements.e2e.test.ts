import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { webAppUrl } from "../src/lib/webAppUrl.js";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "../src/lib/announcementUnsubscribe.js";
import { AnnouncementService, isSafeLinkPath, normalizeLinkPath } from "../src/services/announcementService.js";
import {
  EmailDeliveryUnconfirmedError,
  buildAnnouncementEmail,
  testEmailCapture,
  type AnnouncementEmailPayload,
  type EmailSender
} from "../src/services/emailSender.js";
import { loginForTest } from "./helpers/login.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Who = { cookie: string; personId: string; email: string };
const run = Date.now();
const R = `ann${run}`;
/** Batch years nobody else uses (the suite's people are 2015+), so counts are exact. */
const Y1 = 1961 + (run % 18) * 2;
const Y2 = Y1 + 1;

/**
 * Admin announcements: audience filters, confirm-count, test send, in-app items, email queue
 * (both addresses, de-duplicated, opt-out, throttled, idempotent, resumable) and unsubscribe.
 * Local test database only.
 */
describe("admin announcements (integration, local test database only)", () => {
  let app: App;
  let db: Pool;
  let admin: Who;
  let member: Who;
  const m: Record<string, Who> = {};
  let placeA: string;
  let placePending: string;

  const req = (method: "GET" | "POST", url: string, w: Who | null, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: w ? { cookie: w.cookie } : {},
      ...(payload !== undefined ? { payload: payload as object } : {})
    });
  const content = (title: string, extra: Record<string, unknown> = {}) => ({
    title,
    body: "Line one.\n\nLine two.",
    linkPath: null,
    channels: "both",
    ...extra
  });
  const preview = async (filters: Record<string, unknown>) => {
    const res = await req("POST", "/v1/admin/announcements/preview", admin, { filters });
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as { count: number; sample: Array<{ personId: string }> };
  };
  const deliveries = async (announcementId: string) =>
    (
      await db.query<{ person_id: string; address: string; address_kind: string; status: string; attempts: number }>(
        `SELECT person_id, address::text AS address, address_kind, status, attempts
         FROM announcement_email_deliveries WHERE announcement_id = $1 ORDER BY address`,
        [announcementId]
      )
    ).rows;
  const mailsFor = (title: string) => testEmailCapture.announcementEmails.filter((e) => e.title === title);
  const newPerson = async (key: string) => {
    const email = `${R}.${key}@iitbhu.ac.in`;
    const w = await loginForTest(app, email);
    m[key] = { ...w, email };
    return m[key]!;
  };
  const dept = async (code: string) =>
    (await db.query<{ id: string }>(`SELECT id FROM departments WHERE code = $1`, [code])).rows[0]!.id;
  /** Nothing else queued, so each worker pass below only sees this test's rows. */
  const drain = () => app.announcementService.processEmailQueue();

  beforeAll(async () => {
    app = await createApp();
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    admin = { ...(await loginForTest(app, `${R}.admin@iitbhu.ac.in`)), email: `${R}.admin@iitbhu.ac.in` };
    await db.query(`UPDATE people SET role = 'admin', full_name = $2 WHERE id = $1`, [admin.personId, `Admin ${R}`]);
    member = { ...(await loginForTest(app, `${R}.member@iitbhu.ac.in`)), email: `${R}.member@iitbhu.ac.in` };

    placeA = (
      await db.query<{ id: string }>(
        `INSERT INTO canonical_places (country, city_label, status) VALUES ('India', $1, 'approved') RETURNING id`,
        [`AnnCityA${run}`]
      )
    ).rows[0]!.id;
    placePending = (
      await db.query<{ id: string }>(
        `INSERT INTO canonical_places (country, city_label, status) VALUES ('India', $1, 'pending') RETURNING id`,
        [`AnnCityP${run}`]
      )
    ).rows[0]!.id;

    const [cse, ece, mech] = [await dept("cse"), await dept("ece"), await dept("mech")];
    const set = (w: Who, sql: string, params: unknown[]) => db.query(`UPDATE people SET ${sql} WHERE id = $1`, [w.personId, ...params]);

    // a: Y1 cse, linked to approved city A, separate personal email.
    await set(await newPerson("a"), `batch_year = $2, department_id = $3, residence_canonical_place_id = $4, personal_email = $5, full_name = 'Ann A'`, [
      Y1, cse, placeA, `${R}.a.personal@gmail.com`
    ]);
    // b: Y1 ece, personal email equal to the institutional one (different case) -> one email.
    await set(await newPerson("b"), `batch_year = $2, department_id = $3, personal_email = $4, full_name = 'Ann B'`, [
      Y1, ece, `${R}.B@IITBHU.AC.IN`
    ]);
    // c: Y2 cse, linked to a city that isn't approved.
    await set(await newPerson("c"), `batch_year = $2, department_id = $3, residence_canonical_place_id = $4, full_name = 'Ann C'`, [
      Y2, cse, placePending
    ]);
    // d: Y2 mech, typed city A's name but not linked.
    await set(await newPerson("d"), `batch_year = $2, department_id = $3, residence_city = $4, residence_country = 'India', full_name = 'Ann D'`, [
      Y2, mech, `AnnCityA${run}`
    ]);
    // Never in an audience: test user, suspended, deleted (all Y1 cse, city A).
    await set(await newPerson("demo"), `batch_year = $2, department_id = $3, residence_canonical_place_id = $4, is_test_user = TRUE`, [Y1, cse, placeA]);
    await set(await newPerson("susp"), `batch_year = $2, department_id = $3, residence_canonical_place_id = $4, suspended_at = now()`, [Y1, cse, placeA]);
    await set(await newPerson("gone"), `batch_year = $2, department_id = $3, residence_canonical_place_id = $4, deleted_at = now()`, [Y1, cse, placeA]);

    await drain();
  });

  afterAll(async () => {
    await db.query(`DELETE FROM announcements WHERE created_by_person_id = $1`, [admin.personId]);
    await db.query(
      `UPDATE people SET batch_year = NULL, residence_canonical_place_id = NULL, announcement_emails_opt_out = FALSE
       WHERE split_part(institutional_email::text, '@', 1) LIKE $1`,
      [`${R}.%`]
    );
    await db.query(`DELETE FROM canonical_places WHERE id = ANY($1::uuid[])`, [[placeA, placePending]]);
    await db.end();
    await app.close();
  });

  /* ---------------- Access ---------------- */

  it("is admin-only: 401 signed out, 403 for members", async () => {
    expect((await req("POST", "/v1/admin/announcements/preview", null, { filters: {} })).statusCode).toBe(401);
    expect((await req("GET", "/v1/admin/announcements", null)).statusCode).toBe(401);
    for (const [method, url, body] of [
      ["POST", "/v1/admin/announcements/preview", { filters: {} }],
      ["POST", "/v1/admin/announcements/test", content("x")],
      ["POST", "/v1/admin/announcements", { ...content("x"), filters: {}, confirmCount: 1 }],
      ["GET", "/v1/admin/announcements", undefined]
    ] as const) {
      expect((await req(method, url, member, body)).statusCode, url).toBe(403);
    }
  });

  /* ---------------- Audience ---------------- */

  it("filters: AND across batch / department / city, OR within each", async () => {
    const ids = (p: { sample: Array<{ personId: string }> }) => p.sample.map((s) => s.personId).sort();
    const one = await preview({ batchYears: [Y1] });
    expect(one.count).toBe(2);
    expect(ids(one)).toEqual([m.a!.personId, m.b!.personId].sort());

    expect((await preview({ batchYears: [Y1, Y2] })).count).toBe(4);
    expect((await preview({ batchYears: [Y1, Y2], departmentCodes: ["cse"] })).count).toBe(2);
    expect((await preview({ batchYears: [Y1, Y2], departmentCodes: ["cse", "mech"] })).count).toBe(3);
    expect((await preview({ batchYears: [Y2], departmentCodes: ["ece"] })).count).toBe(0);
  });

  it("city filter counts only members linked to an approved city record", async () => {
    const linked = await preview({ batchYears: [Y1, Y2], placeIds: [placeA] });
    expect(linked.count).toBe(1); // a only: d typed the name but isn't linked; demo/suspended/deleted never count
    expect(linked.sample[0]!.personId).toBe(m.a!.personId);
    expect((await preview({ batchYears: [Y1, Y2], placeIds: [placePending] })).count).toBe(0);

    const send = await req("POST", "/v1/admin/announcements", admin, {
      ...content(`${R} pending city`),
      filters: { placeIds: [placePending] },
      confirmCount: 0
    });
    expect(send.statusCode).toBe(400);
    expect(send.json().code).toBe("ANNOUNCEMENT_BAD_CITY");
  });

  it("no filters means every member (not test users, suspended or deleted)", async () => {
    const all = await preview({});
    const expected = (
      await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM people p
         WHERE p.deleted_at IS NULL AND p.suspended_at IS NULL AND NOT COALESCE(p.is_test_user, FALSE)
           AND split_part(lower(p.institutional_email::text), '@', 1) NOT LIKE 'batchdemo.%'
           AND split_part(lower(p.institutional_email::text), '@', 1) NOT LIKE 'platformdemo.%'
           AND split_part(lower(p.institutional_email::text), '@', 1) NOT LIKE 'demo.alumni.%'`
      )
    ).rows[0]!.n;
    expect(all.count).toBe(expected);
    expect(all.sample.length).toBeLessThanOrEqual(5);
    expect(all.count).toBeGreaterThanOrEqual(6); // admin, member, a, b, c, d
  });

  it("rejects bad filters", async () => {
    const bad = async (filters: unknown) =>
      (await req("POST", "/v1/admin/announcements/preview", admin, { filters })).statusCode;
    expect(await bad({ departmentCodes: ["nope"] })).toBe(400);
    expect(await bad({ batchYears: [1800] })).toBe(400);
    expect(await bad({ placeIds: ["not-a-uuid"] })).toBe(400);
  });

  /* ---------------- Content ---------------- */

  it("link must be a page inside the app", async () => {
    for (const linkPath of ["https://evil.example/x", "//evil.example/x", "javascript:alert(1)", "/a b", "/x\\y", "http:/x"]) {
      const res = await req("POST", "/v1/admin/announcements/test", admin, content(`${R} bad link`, { linkPath }));
      expect(res.statusCode, linkPath).toBe(400);
      expect(res.json().code).toBe("ANNOUNCEMENT_BAD_REQUEST");
    }
    const ok = await req("POST", "/v1/admin/announcements/test", admin, content(`${R} app link`, { linkPath: "/app/intent/career", channels: "in_app" }));
    expect(ok.statusCode, ok.body).toBe(201);
    expect(ok.json().announcement.linkPath).toBe("/intent/career");

    expect(normalizeLinkPath("intent/career?x=1")).toBe("/intent/career?x=1");
    expect(normalizeLinkPath("  ")).toBeNull();
    expect(isSafeLinkPath("/w/AB12#top")).toBe(true);
  });

  it("enforces title and message limits", async () => {
    const send = (extra: Record<string, unknown>) =>
      req("POST", "/v1/admin/announcements/test", admin, content(`${R} limits`, { channels: "in_app", ...extra }));
    expect((await send({ title: "x".repeat(121) })).statusCode).toBe(400);
    expect((await send({ title: "   " })).statusCode).toBe(400);
    expect((await send({ body: "y".repeat(2001) })).statusCode).toBe(400);
    expect((await send({ channels: "push" })).statusCode).toBe(400);
    expect((await send({ title: "x".repeat(120), body: "y".repeat(2000) })).statusCode).toBe(201);
  });

  /* ---------------- Sending ---------------- */

  it("refuses with 409 and the new count when the audience changed, and sends nothing", async () => {
    const title = `${R} stale count`;
    const res = await req("POST", "/v1/admin/announcements", admin, { ...content(title), filters: { batchYears: [Y1] }, confirmCount: 3 });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: "ANNOUNCEMENT_COUNT_CHANGED", count: 2 });
    const rows = await db.query(`SELECT 1 FROM announcements WHERE title = $1`, [title]);
    expect(rows.rowCount).toBe(0);
  });

  it("a test send goes to the sending admin only, even if they opted out of emails", async () => {
    await db.query(`UPDATE people SET personal_email = $2, announcement_emails_opt_out = TRUE WHERE id = $1`, [
      admin.personId,
      `${R}.admin.personal@gmail.com`
    ]);
    const title = `${R} test send`;
    const res = await req("POST", "/v1/admin/announcements/test", admin, content(title));
    expect(res.statusCode, res.body).toBe(201);
    const a = res.json().announcement;
    expect(a).toMatchObject({ isTest: true, recipientCount: 1, status: "sending" });

    const recipients = await db.query<{ person_id: string }>(`SELECT person_id FROM announcement_recipients WHERE announcement_id = $1`, [a.id]);
    expect(recipients.rows.map((r) => r.person_id)).toEqual([admin.personId]);
    await drain();
    expect(mailsFor(title).map((e) => e.to).sort()).toEqual([admin.email, `${R}.admin.personal@gmail.com`].sort());
    await db.query(`UPDATE people SET announcement_emails_opt_out = FALSE WHERE id = $1`, [admin.personId]);
  });

  it("sends in-app and email to exactly the audience: both addresses, de-duplicated", async () => {
    const title = `${R} both`;
    const res = await req("POST", "/v1/admin/announcements", admin, {
      ...content(title, { linkPath: "/intent/career" }),
      filters: { batchYears: [Y1] },
      confirmCount: 2
    });
    expect(res.statusCode, res.body).toBe(201);
    const a = res.json().announcement;
    expect(a).toMatchObject({ recipientCount: 2, isTest: false, channels: "both", email: { queued: 3 } });
    expect(a.filters).toEqual({ batchYears: [Y1], departmentCodes: [], places: [] });

    const d = await deliveries(a.id);
    expect(d.map((x) => x.address.toLowerCase()).sort()).toEqual(
      [m.a!.email, `${R}.a.personal@gmail.com`, m.b!.email].map((s) => s.toLowerCase()).sort()
    );
    expect(d.find((x) => x.person_id === m.b!.personId)!.address_kind).toBe("institutional");

    // In-app: recipients see it in the Notifications panel; nobody else does.
    const itemFor = async (w: Who) => {
      const list = await req("GET", "/v1/notifications", w);
      expect(list.statusCode).toBe(200);
      return (list.json().items as Array<{ kind: string; announcementId?: string; title?: string; linkPath?: string; unseen: boolean }>).find(
        (i) => i.kind === "announcement" && i.announcementId === a.id
      );
    };
    expect(await itemFor(m.a!)).toMatchObject({ title, linkPath: "/intent/career", unseen: true });
    expect(await itemFor(m.b!)).toBeTruthy();
    for (const w of [m.c!, m.d!, admin, member, m.demo!, m.susp!]) expect(await itemFor(w)).toBeUndefined();
    const summary = (await req("GET", "/v1/notifications/summary", m.a!)).json();
    expect(summary.unseenCount).toBeGreaterThanOrEqual(1);

    // Email worker: three emails, each with the link and unsubscribe links.
    const totals = await drain();
    expect(totals.sent).toBeGreaterThanOrEqual(3);
    const mails = mailsFor(title);
    expect(mails).toHaveLength(3);
    expect(mails[0]!.linkUrl).toBe(`${webAppUrl()}/intent/career`);
    expect(mails[0]!.unsubscribeUrl.startsWith(`${webAppUrl()}/unsubscribe?token=`)).toBe(true);
    expect(mails[0]!.oneClickUnsubscribeUrl).toMatch(/\/v1\/announcements\/unsubscribe\?token=/);

    // Seen + history detail.
    await req("POST", "/v1/notifications/mark-all-seen", m.a!);
    const detail = (await req("GET", `/v1/admin/announcements/${a.id}`, admin)).json().announcement;
    expect(detail).toMatchObject({ status: "sent", email: { sent: 3, queued: 0, failed: 0 }, inApp: { delivered: 2, seen: 1 } });
    expect(detail.sender.name).toBe(`Admin ${R}`);
    expect(detail.body).toBe("Line one.\n\nLine two.");

    const history = (await req("GET", "/v1/admin/announcements?limit=20", admin)).json().announcements as Array<{ id: string }>;
    expect(history.some((h) => h.id === a.id)).toBe(true);
    expect((await req("GET", `/v1/admin/announcements/00000000-0000-4000-8000-000000000000`, admin)).statusCode).toBe(404);
  });

  it("email-only: no in-app item; in-app only: no email", async () => {
    const emailOnly = await req("POST", "/v1/admin/announcements", admin, {
      ...content(`${R} email only`, { channels: "email" }),
      filters: { batchYears: [Y2], departmentCodes: ["cse"] },
      confirmCount: 1
    });
    expect(emailOnly.statusCode, emailOnly.body).toBe(201);
    const list = (await req("GET", "/v1/notifications", m.c!)).json().items as Array<{ announcementId?: string }>;
    expect(list.some((i) => i.announcementId === emailOnly.json().announcement.id)).toBe(false);
    await drain();
    expect(mailsFor(`${R} email only`).map((e) => e.to)).toEqual([m.c!.email]);

    const inApp = await req("POST", "/v1/admin/announcements", admin, {
      ...content(`${R} in-app only`, { channels: "in_app" }),
      filters: { batchYears: [Y2], departmentCodes: ["cse"] },
      confirmCount: 1
    });
    expect(inApp.json().announcement).toMatchObject({ status: "sent", email: { queued: 0, sent: 0 } });
    expect(await deliveries(inApp.json().announcement.id)).toHaveLength(0);
  });

  /* ---------------- Unsubscribe ---------------- */

  it("unsubscribe: signed token, tamper-proof, undo; opted-out members still get the in-app item", async () => {
    const token = createUnsubscribeToken(m.d!.personId);
    expect(verifyUnsubscribeToken(token)).toBe(m.d!.personId);
    const tampered = `${token.slice(0, -2)}xx`;
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
    expect(verifyUnsubscribeToken(`${m.a!.personId}.${token.split(".")[1]}`)).toBeNull();
    expect(verifyUnsubscribeToken(createUnsubscribeToken(m.d!.personId, "another_secret_value"))).toBeNull();

    const optOut = async () =>
      (await db.query<{ o: boolean }>(`SELECT announcement_emails_opt_out AS o FROM people WHERE id = $1`, [m.d!.personId])).rows[0]!.o;

    // The email link only opens the page (mail scanners follow links).
    const get = await req("GET", `/v1/announcements/unsubscribe?token=${encodeURIComponent(token)}`, null);
    expect(get.statusCode).toBe(303);
    expect(String(get.headers.location)).toBe(`${webAppUrl()}/unsubscribe?token=${encodeURIComponent(token)}`);
    expect(await optOut()).toBe(false);

    expect((await req("POST", "/v1/announcements/unsubscribe", null, { token: tampered })).statusCode).toBe(400);
    expect(await optOut()).toBe(false);

    const post = await req("POST", "/v1/announcements/unsubscribe", null, { token });
    expect(post.statusCode).toBe(200);
    expect(post.json()).toEqual({ unsubscribed: true });
    expect(await optOut()).toBe(true);

    const undo = await req("POST", "/v1/announcements/resubscribe", null, { token });
    expect(undo.json()).toEqual({ unsubscribed: false });
    expect(await optOut()).toBe(false);

    // One-click from a mail app (RFC 8058): form post, token in the query.
    const oneClick = await app.inject({
      method: "POST",
      url: `/v1/announcements/unsubscribe?token=${encodeURIComponent(token)}`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "List-Unsubscribe=One-Click"
    });
    expect(oneClick.statusCode, oneClick.body).toBe(200);
    expect(await optOut()).toBe(true);

    const title = `${R} opted out`;
    const res = await req("POST", "/v1/admin/announcements", admin, {
      ...content(title),
      filters: { batchYears: [Y2], departmentCodes: ["mech"] },
      confirmCount: 1
    });
    expect(res.statusCode, res.body).toBe(201);
    const a = res.json().announcement;
    expect((await deliveries(a.id)).map((x) => x.status)).toEqual(["skipped_opted_out"]);
    await drain();
    expect(mailsFor(title)).toHaveLength(0);
    const items = (await req("GET", "/v1/notifications", m.d!)).json().items as Array<{ announcementId?: string }>;
    expect(items.some((i) => i.announcementId === a.id)).toBe(true);
    expect((await req("GET", `/v1/admin/announcements/${a.id}`, admin)).json().announcement).toMatchObject({
      status: "sent",
      email: { skippedOptedOut: 1, sent: 0 }
    });

    // Opting out after queueing but before sending: skipped at send time.
    await req("POST", "/v1/announcements/resubscribe", null, { token });
    const late = await req("POST", "/v1/admin/announcements", admin, {
      ...content(`${R} late opt-out`, { channels: "email" }),
      filters: { batchYears: [Y2], departmentCodes: ["mech"] },
      confirmCount: 1
    });
    await req("POST", "/v1/announcements/unsubscribe", null, { token });
    await drain();
    expect(mailsFor(`${R} late opt-out`)).toHaveLength(0);
    expect((await deliveries(late.json().announcement.id))[0]!.status).toBe("skipped_opted_out");
    await req("POST", "/v1/announcements/resubscribe", null, { token });
  });

  /* ---------------- Worker ---------------- */

  it("worker is idempotent and resumes after a restart; a stale claim is never re-sent", async () => {
    const title = `${R} resume`;
    const res = await req("POST", "/v1/admin/announcements", admin, {
      ...content(title, { channels: "email" }),
      filters: { batchYears: [Y1] },
      confirmCount: 2
    });
    const id = res.json().announcement.id as string;
    // Simulate a process that stopped mid-send: one row claimed 11 minutes ago, never finished.
    await db.query(
      `UPDATE announcement_email_deliveries SET status = 'sending', claimed_at = now() - interval '11 minutes', attempts = 1
       WHERE announcement_id = $1 AND address = $2`,
      [id, m.b!.email]
    );

    // A fresh service (as after a restart) picks up the queue.
    const restarted = new AnnouncementService(db, testEmailCapture, { autoStartWorker: false, sleep: async () => undefined });
    await restarted.processEmailQueue();
    expect(mailsFor(title).map((e) => e.to).sort()).toEqual([m.a!.email, `${R}.a.personal@gmail.com`].sort());

    const d = await deliveries(id);
    expect(d.find((x) => x.address.toLowerCase() === m.b!.email.toLowerCase())).toMatchObject({ status: "failed" });

    // Second pass sends nothing new.
    await restarted.processEmailQueue();
    await drain();
    expect(mailsFor(title)).toHaveLength(2);
    const detail = (await req("GET", `/v1/admin/announcements/${id}`, admin)).json().announcement;
    expect(detail).toMatchObject({ status: "partially_failed", email: { sent: 2, failed: 1, queued: 0 } });
  });

  it("retries clear rejections up to 3 attempts; an unconfirmed send is never retried", async () => {
    const send = async (title: string) => {
      const res = await req("POST", "/v1/admin/announcements", admin, {
        ...content(title, { channels: "email" }),
        filters: { batchYears: [Y2], departmentCodes: ["cse"] },
        confirmCount: 1
      });
      expect(res.statusCode, res.body).toBe(201);
      return res.json().announcement.id as string;
    };

    const once = await send(`${R} retry once`);
    testEmailCapture.announcementFailures.push(true);
    const t1 = await drain();
    expect(t1).toMatchObject({ sent: 1, retried: 1, failed: 0 });
    expect((await deliveries(once))[0]).toMatchObject({ status: "sent", attempts: 2 });

    const always = await send(`${R} retry always`);
    testEmailCapture.announcementFailures.push(true, true, true);
    const t2 = await drain();
    expect(t2).toMatchObject({ sent: 0, retried: 2, failed: 1 });
    expect((await deliveries(always))[0]).toMatchObject({ status: "failed", attempts: 3 });
    expect(testEmailCapture.announcementFailures).toHaveLength(0);

    // Provider didn't answer: may have gone out, so it is marked failed at once.
    const unconfirmed = await send(`${R} unconfirmed`);
    const calls: string[] = [];
    const flaky: EmailSender = Object.assign(Object.create(testEmailCapture) as EmailSender, {
      sendAnnouncementEmail: async (p: AnnouncementEmailPayload) => {
        calls.push(p.to);
        throw new EmailDeliveryUnconfirmedError("timeout");
      }
    });
    const svc = new AnnouncementService(db, flaky, { autoStartWorker: false, sleep: async () => undefined });
    expect(await svc.processEmailQueue()).toMatchObject({ sent: 0, failed: 1, retried: 0 });
    expect(calls).toHaveLength(1);
    expect((await deliveries(unconfirmed))[0]).toMatchObject({ status: "failed", attempts: 1 });
  });

  it("throttles sends to the configured rate", async () => {
    await req("POST", "/v1/admin/announcements", admin, {
      ...content(`${R} throttle`, { channels: "email" }),
      filters: { batchYears: [Y1] },
      confirmCount: 2
    });
    const sleeps: number[] = [];
    const sent: string[] = [];
    const sender: EmailSender = Object.assign(Object.create(testEmailCapture) as EmailSender, {
      sendAnnouncementEmail: async (p: AnnouncementEmailPayload) => {
        sent.push(p.to);
      }
    });
    const svc = new AnnouncementService(db, sender, {
      emailsPerSecond: 4,
      autoStartWorker: false,
      sleep: async (ms) => {
        sleeps.push(ms);
      }
    });
    await svc.processEmailQueue();
    expect(sent).toHaveLength(3);
    expect(sleeps).toEqual([250, 250]);
  });

  /* ---------------- Email content ---------------- */

  it("email: escaped HTML, plain text, link, unsubscribe footer and one-click headers", () => {
    const mail = buildAnnouncementEmail(
      {
        to: "x@example.com",
        title: "Reunion <2027>",
        body: "Hello & welcome.\nSecond line.\n\nNew paragraph <b>not bold</b>",
        linkUrl: "https://example.org/app/intent/career",
        unsubscribeUrl: "https://example.org/app/unsubscribe?token=t",
        oneClickUnsubscribeUrl: "https://api.example.org/v1/announcements/unsubscribe?token=t"
      },
      "AlmaMatter"
    );
    expect(mail.subject).toBe("Reunion <2027>");
    expect(mail.html).toContain("Reunion &lt;2027&gt;");
    expect(mail.html).toContain("Hello &amp; welcome.<br>Second line.");
    expect(mail.html).toContain("&lt;b&gt;not bold&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>not bold</b>");
    expect(mail.html).toContain("https://example.org/app/intent/career");
    expect(mail.text).toContain("https://example.org/app/unsubscribe?token=t");
    expect(mail.headers["List-Unsubscribe"]).toBe("<https://api.example.org/v1/announcements/unsubscribe?token=t>");
    expect(mail.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});
