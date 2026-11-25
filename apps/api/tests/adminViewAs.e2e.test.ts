import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { VIEW_AS_COOKIE_NAME, cappedRole, parseViewAsAllowlist } from "../src/lib/viewAs.js";
import { loginForTest } from "./helpers/login.js";
import { assertDisposableCitiesDatabase } from "./helpers/disposableDatabase.js";
import { TEST_IDENTITY_SET } from "./helpers/identity.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Who = { cookie: string; personId: string; email: string };
type InjectResponse = Awaited<ReturnType<App["inject"]>>;
const run = Date.now();
const R = `viewas${run}`;

describe("view-as allowlist helpers", () => {
  it("parses a comma list: trimmed, lowercased, empties and junk dropped", () => {
    expect([...parseViewAsAllowlist(" Owner@IITBHU.ac.in , ,x@itbhu.ac.in,notanemail ")]).toEqual([
      "owner@iitbhu.ac.in",
      "x@itbhu.ac.in"
    ]);
    expect(parseViewAsAllowlist("").size).toBe(0);
    expect(parseViewAsAllowlist(undefined).size).toBe(0);
  });

  it("never gives the viewed identity more access than the real admin", () => {
    expect(cappedRole("alumni", "admin")).toBe("alumni");
    expect(cappedRole("admin", "admin")).toBe("admin");
    expect(cappedRole("super_admin", "admin")).toBe("admin");
    expect(cappedRole("super_admin", "super_admin")).toBe("super_admin");
  });
});

/** Admin "view as member": access, read-only enforcement, no member side effects, audit, expiry. */
describe("admin view as member (integration, local test database only)", () => {
  let app: App;
  let appOff: App;
  let db: Pool;
  let owner: Who; // admin on the allowlist
  let otherAdmin: Who; // admin, not on the allowlist
  let member: Who; // plain member
  let target: Who; // the member being viewed
  let sender: Who; // sends the target a note (so the target has a notification)
  const logLines: string[] = [];
  const viewAsLogs = () =>
    logLines
      .map((l) => JSON.parse(l) as { msg: string; viewAs?: Record<string, unknown> })
      .filter((l) => l.viewAs && l.msg.startsWith("admin view-as"));

  const req = (a: App, method: "GET" | "POST" | "PATCH" | "DELETE", url: string, cookie: string | null, payload?: unknown) =>
    a.inject({
      method,
      url,
      headers: cookie ? { cookie } : {},
      ...(payload !== undefined ? { payload: payload as object } : {})
    });
  const viewAsCookieFrom = (res: InjectResponse): string | null => {
    const c = res.cookies.find((x) => x.name === VIEW_AS_COOKIE_NAME);
    return c && c.value ? `${VIEW_AS_COOKIE_NAME}=${c.value}` : null;
  };
  const start = async (a: App, w: Who, personId: string) => req(a, "POST", "/v1/admin/view-as", w.cookie, { personId });
  /** Starts view-as as the owner; returns the combined cookie header (owner session + view-as). */
  const startAsOwner = async (): Promise<string> => {
    const res = await start(app, owner, target.personId);
    expect(res.statusCode, res.body).toBe(201);
    const v = viewAsCookieFrom(res);
    expect(v).not.toBeNull();
    return `${owner.cookie}; ${v}`;
  };
  const end = (cookie: string) => req(app, "POST", "/v1/admin/view-as/end", cookie);
  const readCount = async (personId: string) =>
    (
      await db.query<{ n: number }>(
        `SELECT COALESCE(SUM(count), 0)::int AS n FROM discovery_read_counters WHERE person_id = $1`,
        [personId]
      )
    ).rows[0]!.n;
  const usageEvents = async (personId: string) =>
    (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM beta_usage_events WHERE person_id = $1`, [personId]))
      .rows[0]!.n;
  const audit = async (adminId: string) =>
    (
      await db.query<{ event: string; admin_person_id: string; target_person_id: string; ip: string | null; created_at: Date }>(
        `SELECT event, admin_person_id, target_person_id, host(ip) AS ip, created_at
         FROM admin_view_as_audit WHERE admin_person_id = $1 ORDER BY created_at, event DESC`,
        [adminId]
      )
    ).rows;

  beforeAll(async () => {
    assertDisposableCitiesDatabase(process.env.DATABASE_URL);
    const ownerEmail = `${R}.owner@iitbhu.ac.in`;
    // Mixed case and spaces on purpose: the allowlist is normalised.
    app = await createApp({
      viewAs: { adminEmails: ` ${ownerEmail.toUpperCase()} , someone-else@iitbhu.ac.in`, ttlMinutes: 30 },
      logStream: { write: (line: string) => void logLines.push(line) }
    });
    appOff = await createApp({ viewAs: { adminEmails: "" } });
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    const person = async (key: string, role: "alumni" | "admin" = "alumni") => {
      const email = `${R}.${key}@iitbhu.ac.in`;
      const p = await loginForTest(app, email);
      await db.query(
        `UPDATE people SET ${TEST_IDENTITY_SET}, role = $2, full_name = $3, batch_year = 2019,
                profile_completed_at = now(), onboarding_completed_at = now(), open_to_preferences = $4::jsonb
         WHERE id = $1`,
        [p.personId, role, `${key} ${R}`, JSON.stringify({ selected: ["coffee"] })]
      );
      return { ...p, email };
    };
    owner = await person("owner", "admin");
    otherAdmin = await person("otheradmin", "admin");
    member = await person("member");
    target = await person("target");
    sender = await person("sender");
    const note = await req(app, "POST", "/v1/contact-requests", sender.cookie, {
      recipientPersonId: target.personId,
      message: "hello, would love to connect over coffee sometime this week",
      source: "cities",
      sourceCategory: "coffee"
    });
    expect(note.statusCode, note.body).toBe(201);
  }, 60_000);

  afterAll(async () => {
    await db?.end();
    await app?.close();
    await appOff?.close();
  });

  it("non-admin is rejected", async () => {
    expect((await req(app, "GET", "/v1/me", member.cookie)).json()).toMatchObject({ canViewAs: false, viewAs: null });
    const res = await start(app, member, target.personId);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("AUTH_FORBIDDEN");
    expect(viewAsCookieFrom(res)).toBeNull();
    expect((await req(app, "GET", "/v1/admin/view-as/people?q=target", member.cookie)).statusCode).toBe(403);
    expect((await req(app, "GET", "/v1/admin/view-as/people?q=target", null)).statusCode).toBe(401);
  });

  it("an admin who is not on the allowlist is rejected", async () => {
    expect((await req(app, "GET", "/v1/me", otherAdmin.cookie)).json()).toMatchObject({ canViewAs: false });
    const res = await start(app, otherAdmin, target.personId);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("VIEW_AS_FORBIDDEN");
    expect((await req(app, "GET", "/v1/admin/view-as/people?q=target", otherAdmin.cookie)).json().code).toBe("VIEW_AS_FORBIDDEN");
    expect(await audit(otherAdmin.personId)).toEqual([]);
  });

  it("feature is off when the allowlist is empty, even for the owner", async () => {
    expect((await req(appOff, "GET", "/v1/me", owner.cookie)).json()).toMatchObject({ canViewAs: false });
    const res = await start(appOff, owner, target.personId);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("VIEW_AS_FORBIDDEN");
    expect(viewAsCookieFrom(res)).toBeNull();
  });

  it("the allowlisted admin can search, but not view as themselves or a missing member", async () => {
    expect((await req(app, "GET", "/v1/me", owner.cookie)).json()).toMatchObject({ canViewAs: true, viewAs: null });
    const found = await req(app, "GET", `/v1/admin/view-as/people?q=${encodeURIComponent(`target ${R}`)}`, owner.cookie);
    expect(found.statusCode, found.body).toBe(200);
    expect(found.json().people).toEqual([
      expect.objectContaining({ personId: target.personId, fullName: `target ${R}`, institutionalEmail: target.email })
    ]);
    // Searching by email finds them too; the owner never appears in their own results.
    const byEmail = (await req(app, "GET", `/v1/admin/view-as/people?q=${encodeURIComponent(R)}`, owner.cookie)).json().people as Array<{ personId: string }>;
    expect(byEmail.map((p) => p.personId)).toContain(target.personId);
    expect(byEmail.map((p) => p.personId)).not.toContain(owner.personId);
    expect((await start(app, owner, owner.personId)).json().code).toBe("VIEW_AS_SELF");
    expect((await start(app, owner, "00000000-0000-4000-8000-000000000000")).statusCode).toBe(404);
  });

  it("allowlisted admin starts; reads return the member's data; every write is refused; no member side effects; end restores", async () => {
    // Control: the member's own reads are counted.
    const ownRead = await req(app, "GET", `/v1/profiles/${sender.personId}`, target.cookie);
    expect(ownRead.statusCode, ownRead.body).toBe(200);
    const countsBefore = await readCount(target.personId);
    expect(countsBefore).toBeGreaterThan(0);
    const eventsBefore = await usageEvents(target.personId);
    const watermarkBefore = (
      await db.query(`SELECT seen_watermark FROM person_notification_state WHERE person_id = $1`, [target.personId])
    ).rows;
    // The member's own sessions and last-active days: never touched by an admin viewing as them.
    const memberActivity = async () => ({
      sessions: (
        await db.query(`SELECT id, last_seen_at, expires_at FROM sessions WHERE person_id = $1 ORDER BY id`, [target.personId])
      ).rows,
      days: (await db.query(`SELECT day FROM member_activity_days WHERE person_id = $1 ORDER BY day`, [target.personId])).rows
    });
    const activityBefore = await memberActivity();
    // A brokered request of the member's that is past its window: reading their list as them must not
    // close it (closing writes and emails the asker); the member's own read or the hourly job does.
    const overdue = (
      await db.query<{ id: string }>(
        `INSERT INTO broker_requests (kind, asker_person_id, company, job_function, message, expires_at)
         VALUES ('referral', $1, 'Acme ${R}', 'tech', 'overdue request for the view-as test', now() - interval '1 minute')
         RETURNING id`,
        [target.personId]
      )
    ).rows[0]!.id;
    const brokerStatus = async () =>
      (await db.query<{ status: string }>(`SELECT status FROM broker_requests WHERE id = $1`, [overdue])).rows[0]!.status;

    const res = await start(app, owner, target.personId);
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json().viewAs;
    expect(body).toMatchObject({
      adminPersonId: owner.personId,
      targetPersonId: target.personId,
      targetName: `target ${R}`,
      targetEmail: target.email,
      readOnly: true
    });
    const minutes = (new Date(body.expiresAt).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30.1);
    const viewAsCookie = res.cookies.find((c) => c.name === VIEW_AS_COOKIE_NAME)!;
    expect(viewAsCookie.httpOnly).toBe(true);
    // The admin's own session cookie is not touched.
    expect(res.cookies.find((c) => c.name === "alumni_session")).toBeUndefined();
    const both = `${owner.cookie}; ${viewAsCookieFrom(res)}`;

    // Audit row for the start.
    const started = await audit(owner.personId);
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({ event: "start", admin_person_id: owner.personId, target_person_id: target.personId, ip: "127.0.0.1" });

    // Reads: the member's identity and data.
    const me = (await req(app, "GET", "/v1/me", both)).json();
    expect(me.person.personId).toBe(target.personId);
    expect(me.person.role).toBe("alumni");
    expect(me.person.viewAs).toBeUndefined();
    expect(me.viewAs).toMatchObject({ targetPersonId: target.personId, adminPersonId: owner.personId });
    expect(me.canViewAs).toBe(true);
    const profile = await req(app, "GET", "/v1/me/profile", both);
    expect(profile.statusCode).toBe(200);
    expect(profile.json().profile.fullName).toBe(`target ${R}`);
    const notes = (await req(app, "GET", "/v1/notifications", both)).json().items as Array<{ kind: string }>;
    expect(notes.map((n) => n.kind)).toContain("contact_request_received");
    const inbox = await req(app, "GET", "/v1/contact-requests/inbox", both);
    expect(inbox.statusCode).toBe(200);
    // Admin-only reads are not available under a member's identity.
    expect((await req(app, "GET", "/v1/admin/metrics", both)).statusCode).toBe(403);

    // Discovery reads and searches work but are not counted against the member or logged as theirs.
    expect((await req(app, "GET", `/v1/profiles/${sender.personId}`, both)).statusCode).toBe(200);
    expect((await req(app, "GET", `/v1/search?q=${encodeURIComponent(R)}`, both)).statusCode).toBe(200);
    expect((await req(app, "GET", "/v1/broker-asks", both)).statusCode).toBe(200);
    expect((await req(app, "GET", "/v1/broker-requests", both)).statusCode).toBe(200);
    expect(await readCount(target.personId)).toBe(countsBefore);
    expect(await usageEvents(target.personId)).toBe(eventsBefore);
    expect(await brokerStatus()).toBe("open");
    // Every other read the member's pages make, for good measure.
    for (const url of [
      "/v1/home/summary",
      "/v1/notifications/summary",
      "/v1/contact-requests/sent",
      "/v1/connection-threads",
      "/v1/intentcasts",
      "/v1/intentcasts/me/received-responses",
      "/v1/cities",
      "/v1/careers/my-company-demand",
      "/v1/me/whatsapp"
    ]) {
      expect((await req(app, "GET", url, both)).statusCode, url).toBe(200);
    }
    expect(await memberActivity()).toEqual(activityBefore);
    expect(await brokerStatus()).toBe("open");

    // Writes: every method, signed-in or not, is refused with 403 VIEW_AS_READ_ONLY.
    const writes: Array<[method: "POST" | "PATCH" | "DELETE", url: string, payload?: unknown]> = [
      ["PATCH", "/v1/me/profile", { fullName: "Changed By Admin" }],
      ["POST", "/v1/notifications/mark-all-seen", {}],
      ["POST", "/v1/broker-asks/00000000-0000-4000-8000-000000000000/seen", {}],
      ["POST", "/v1/broker-asks/00000000-0000-4000-8000-000000000000/respond", { action: "accept" }],
      ["POST", "/v1/cities/offers/seen", {}],
      ["POST", "/v1/contact-requests", { recipientPersonId: sender.personId, message: "should never be sent by an admin", source: "cities", sourceCategory: "coffee" }],
      ["POST", "/v1/intentcasts", { category: "general", title: "x", body: "should never be posted" }],
      ["POST", "/v1/analytics/beta-usage-event", { eventType: "home_browse_clicked", route: "/home" }],
      ["DELETE", "/v1/me/links/00000000-0000-4000-8000-000000000000"],
      ["POST", "/v1/auth/logout-all"],
      ["POST", "/v1/auth/logout"],
      ["POST", "/v1/admin/view-as", { personId: sender.personId }]
    ];
    for (const [method, url, payload] of writes) {
      const w = await req(app, method, url, both, payload);
      expect(w.statusCode, `${method} ${url}: ${w.body}`).toBe(403);
      expect(w.json().code, `${method} ${url}`).toBe("VIEW_AS_READ_ONLY");
    }
    const after = (await db.query(`SELECT full_name FROM people WHERE id = $1`, [target.personId])).rows[0];
    expect(after.full_name).toBe(`target ${R}`);
    expect(
      (await db.query(`SELECT seen_watermark FROM person_notification_state WHERE person_id = $1`, [target.personId])).rows
    ).toEqual(watermarkBefore);
    expect(
      (await db.query(`SELECT count(*)::int AS n FROM contact_requests WHERE sender_person_id = $1`, [target.personId])).rows[0].n
    ).toBe(0);
    expect(await usageEvents(target.personId)).toBe(eventsBefore);
    expect(await memberActivity()).toEqual(activityBefore);
    // The admin's own session survived the refused sign-outs.
    expect((await req(app, "GET", "/v1/me", owner.cookie)).json().person.personId).toBe(owner.personId);

    // End: back to the admin's own account; the cookie is cleared; the end is audited.
    const ended = await end(both);
    expect(ended.statusCode).toBe(200);
    expect(ended.json()).toEqual({ ended: true });
    const cleared = ended.cookies.find((c) => c.name === VIEW_AS_COOKIE_NAME)!;
    expect(cleared.value).toBe("");
    // Even if a browser kept sending the old cookie, it no longer does anything.
    const meAfter = (await req(app, "GET", "/v1/me", both)).json();
    expect(meAfter.person.personId).toBe(owner.personId);
    expect(meAfter.viewAs).toBeNull();
    expect((await req(app, "POST", "/v1/notifications/mark-all-seen", both, {})).statusCode).toBe(200);
    const events = await audit(owner.personId);
    expect(events.map((e) => e.event)).toEqual(["start", "end"]);
    expect(events[1]).toMatchObject({ admin_person_id: owner.personId, target_person_id: target.personId, ip: "127.0.0.1" });
    expect(events[1]!.created_at.getTime()).toBeGreaterThanOrEqual(events[0]!.created_at.getTime());
    // Server log lines for both.
    expect(viewAsLogs().map((l) => [l.msg, l.viewAs!.adminPersonId, l.viewAs!.targetPersonId, l.viewAs!.ip])).toEqual([
      ["admin view-as started", owner.personId, target.personId, "127.0.0.1"],
      ["admin view-as ended", owner.personId, target.personId, "127.0.0.1"]
    ]);
    // Ending again is harmless and records nothing new.
    expect((await end(both)).json()).toEqual({ ended: false });
    expect(await audit(owner.personId)).toHaveLength(2);
    // Control: the member's own read does run the expiry (so it was view-as that held it back).
    expect((await req(app, "GET", "/v1/broker-requests", target.cookie)).statusCode).toBe(200);
    expect(await brokerStatus()).toBe("expired");
  });

  it("an expired view-as token stops working on its own", async () => {
    const both = await startAsOwner();
    expect((await req(app, "GET", "/v1/me", both)).json().person.personId).toBe(target.personId);
    await db.query(
      `UPDATE admin_view_as_sessions SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 minute'
       WHERE admin_person_id = $1 AND ended_at IS NULL`,
      [owner.personId]
    );
    const me = (await req(app, "GET", "/v1/me", both)).json();
    expect(me.person.personId).toBe(owner.personId);
    expect(me.viewAs).toBeNull();
    // Not read-only any more: the admin's own writes go through.
    expect((await req(app, "POST", "/v1/notifications/mark-all-seen", both, {})).statusCode).toBe(200);
    // Ending an expired one still closes the record.
    expect((await end(both)).json()).toEqual({ ended: true });
  });

  it("the view-as cookie only works with the admin's own session and while they stay allowed", async () => {
    const both = await startAsOwner();
    const viewAsOnly = both.split("; ")[1]!;
    // Without any session: signed out.
    expect((await req(app, "GET", "/v1/me", viewAsOnly)).statusCode).toBe(401);
    // With another person's session: that person, unaffected (and their writes are not blocked).
    const stolen = `${member.cookie}; ${viewAsOnly}`;
    expect((await req(app, "GET", "/v1/me", stolen)).json().person.personId).toBe(member.personId);
    expect((await req(app, "POST", "/v1/notifications/mark-all-seen", stolen, {})).statusCode).toBe(200);
    // The admin removed from the allowlist (here: an API with the feature off): ignored at once.
    expect((await req(appOff, "GET", "/v1/me", both)).json().person.personId).toBe(owner.personId);
    // The admin demoted: ignored at once.
    await db.query(`UPDATE people SET role = 'alumni' WHERE id = $1`, [owner.personId]);
    try {
      expect((await req(app, "GET", "/v1/me", both)).json().person.personId).toBe(owner.personId);
    } finally {
      await db.query(`UPDATE people SET role = 'admin' WHERE id = $1`, [owner.personId]);
    }
    expect((await req(app, "GET", "/v1/me", both)).json().person.personId).toBe(target.personId);
    expect((await end(both)).json()).toEqual({ ended: true });
  });
});
