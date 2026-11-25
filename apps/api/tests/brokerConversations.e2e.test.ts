import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { generateOpaqueToken, hashSecret } from "../src/lib/crypto.js";
import { SessionRepo } from "../src/repos/sessionRepo.js";
import {
  BROKER_CONVERSATION_INACTIVE_DAYS,
  BROKER_MESSAGE_MAX_CHARS,
  BROKER_MESSAGE_MAX_UNANSWERED,
  BROKER_MESSAGES_PER_WINDOW
} from "../src/services/brokerConversationService.js";
import { SESSION_COOKIE } from "./helpers/login.js";
import { TEST_DEGREE_ID_SQL, TEST_DEPARTMENT_ID_SQL } from "./helpers/identity.js";
import { referralNote } from "./helpers/note.js";

/**
 * Brokered requests, second half (migration 079), end to end: a yes shares no contact; the asker and
 * the helper who said yes get a private conversation with limits; notifications cover a new ask, a
 * yes, a new message and a request closing with no one available (never a decline).
 * Requires a disposable test database (DATABASE_URL) with migrations through 079. No emails are sent.
 */
type App = Awaited<ReturnType<typeof createApp>>;
type Member = { id: string; cookie: string; email: string; personal: string; phone: string };
type Item = { kind: string; id: string; unseen: boolean; requestId?: string; unreadCount?: number; lastMessagePreview?: string };
const R = `${Date.now()}`;

describe("Brokered conversations and notifications (requires DB)", () => {
  let app: App;
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  let n = 0;
  let fullTime = "";

  async function member(): Promise<Member> {
    const i = n++;
    const email = `bc-${R}-${i}@iitbhu.ac.in`;
    const personal = `bc.personal.${R}.${i}@example.com`;
    const phone = `+91${R.slice(-8)}${String(i).padStart(2, "0")}`;
    const row = await db.query<{ id: string }>(
      `INSERT INTO people (institutional_email, personal_email, mobile_phone, full_name, batch_year, department_id, degree_id, profile_completed_at, onboarding_completed_at)
       VALUES ($1, $2, $3, $4, 2019, ${TEST_DEPARTMENT_ID_SQL}, ${TEST_DEGREE_ID_SQL}, now(), now()) RETURNING id`,
      [email, personal, phone, `Convo ${R} ${i}`]
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
    return { id: row.rows[0]!.id, cookie: `${SESSION_COOKIE}=${token}`, email, personal, phone };
  }

  const req = (method: "GET" | "POST", url: string, who: Member, payload?: unknown) =>
    app.inject({ method, url, headers: { cookie: who.cookie }, ...(payload !== undefined ? { payload: payload as object } : {}) });
  const notes = async (who: Member) => (await req("GET", "/v1/notifications", who)).json().items as Item[];
  const send = (who: Member, requestId: string, body: unknown) =>
    req("POST", `/v1/broker-requests/${requestId}/conversation/messages`, who, { body });

  /** No one's contact may leave the API because of a brokered yes. */
  function expectNoContact(payload: string, ...people: Member[]) {
    for (const p of people) {
      expect(payload).not.toContain(p.email);
      expect(payload).not.toContain(p.personal);
      expect(payload).not.toContain(p.phone);
    }
    expect(payload).not.toMatch(/contactShared|askerContact|recipientContact/);
  }

  /** A referral request at a new company with these helpers; returns the request and each helper's ask. */
  async function referral(asker: Member, helpers: Member[]) {
    const company = `Convoco ${R} ${n}`;
    const org = (await db.query<{ id: string }>(`INSERT INTO organizations (name, approval_status) VALUES ($1, 'approved') RETURNING id`, [company])).rows[0]!.id;
    for (const h of helpers) {
      await db.query(`INSERT INTO occupations (person_id, occupation_type_id, organization_id, role_title, is_current) VALUES ($1, $2, $3, 'Engineer', true)`, [h.id, fullTime, org]);
    }
    const created = await req("POST", "/v1/broker-requests", asker, { kind: "referral", jobFunction: "product", note: referralNote({ company }) });
    expect(created.statusCode, created.body).toBe(201);
    const requestId = created.json().request.id as string;
    const asks = new Map<string, string>();
    for (const h of helpers) asks.set(h.id, ((await req("GET", "/v1/broker-asks", h)).json().asks as Array<{ askId: string }>)[0]!.askId);
    return { requestId, askOf: (h: Member) => asks.get(h.id)! };
  }

  beforeAll(async () => {
    app = await createApp();
    fullTime = (await db.query<{ id: string }>(`SELECT id FROM occupation_types WHERE code = 'full_time_employment'`)).rows[0]!.id;
  });
  afterAll(async () => {
    await app?.close();
    await db.end();
  });

  it("a yes shares no contact anywhere; only the asker and that helper can reach the conversation", async () => {
    const asker = await member();
    const [decliner, yes, late] = [await member(), await member(), await member()];
    const stranger = await member();
    const { requestId, askOf } = await referral(asker, [decliner, yes, late]);

    expect((await req("POST", `/v1/broker-asks/${askOf(decliner)}/respond`, decliner, { action: "decline" })).statusCode).toBe(200);
    const answered = await req("POST", `/v1/broker-asks/${askOf(yes)}/respond`, yes, { action: "accept" });
    expect(answered.json()).toMatchObject({ status: "connected", requestId });
    expectNoContact(answered.body, asker, yes);

    // Before anyone writes: both see an open, empty conversation with the other's name only.
    const forAsker = await req("GET", `/v1/broker-requests/${requestId}/conversation`, asker);
    expect(forAsker.statusCode, forAsker.body).toBe(200);
    expect(forAsker.json().conversation).toMatchObject({
      requestId,
      role: "asker",
      state: "open",
      canSend: true,
      counterpart: { personId: yes.id, institutionName: "IIT (BHU) Varanasi" },
      messages: [],
      limits: { maxChars: BROKER_MESSAGE_MAX_CHARS }
    });
    expect((await req("GET", `/v1/broker-requests/${requestId}/conversation`, yes)).json().conversation.role).toBe("helper");

    expect((await send(asker, requestId, "Thanks so much! Could we do a quick call this week?")).statusCode).toBe(201);
    const reply = await send(yes, requestId, "Sure. I'm at vikram.call@example.com if email is easier.");
    expect(reply.statusCode).toBe(201);
    // Typed by the helper themselves: that's theirs to share.
    expect(reply.json().message).toMatchObject({ mine: true, body: "Sure. I'm at vikram.call@example.com if email is easier." });

    // Nothing the platform returns carries either person's contact.
    const payloads = [
      (await req("GET", `/v1/broker-requests/${requestId}/conversation`, asker)).body,
      (await req("GET", `/v1/broker-requests/${requestId}/conversation`, yes)).body,
      (await req("GET", "/v1/broker-requests", asker)).body,
      (await req("GET", "/v1/broker-asks", yes)).body,
      (await req("GET", "/v1/notifications", asker)).body,
      (await req("GET", "/v1/notifications", yes)).body
    ];
    for (const p of payloads) expectNoContact(p, asker, yes);
    const sent = (await req("GET", "/v1/contact-requests/sent", asker)).json().requests as Array<{ recipientPersonId: string; recipientContactShared: string | null; brokerRequestId: string | null }>;
    expect(sent.find((s) => s.recipientPersonId === yes.id)).toMatchObject({ recipientContactShared: null, brokerRequestId: requestId });
    // Profiles and search never say "Accepted your reachout · See their contact" for a brokered yes.
    expect((await req("GET", `/v1/contact-requests/status?recipientPersonId=${yes.id}`, asker)).json()).toEqual({ yourNote: null });

    // Third parties: the helper who declined, the one asked too late, and anyone else.
    for (const other of [decliner, late, stranger]) {
      expect((await req("GET", `/v1/broker-requests/${requestId}/conversation`, other)).statusCode).toBe(404);
      expect((await send(other, requestId, "hello")).statusCode).toBe(404);
      expect((await req("POST", `/v1/broker-requests/${requestId}/conversation/read`, other)).statusCode).toBe(404);
      expect((await req("POST", `/v1/broker-requests/${requestId}/conversation/close`, other)).statusCode).toBe(404);
    }

    // The general messaging endpoints never expose a brokered conversation, even to its own people.
    const thread = (await db.query<{ id: string }>(`SELECT id FROM connection_threads WHERE broker_request_id = $1`, [requestId])).rows[0]!.id;
    expect((await req("GET", `/v1/connection-threads/${thread}`, asker)).statusCode).toBe(404);
    expect((await req("POST", `/v1/connection-threads/${thread}/disclose`, yes, { items: [{ kind: "personal_email" }] })).statusCode).toBe(404);
    expect(JSON.stringify((await req("GET", "/v1/connection-threads", asker)).json())).not.toContain(thread);
  });

  it("limits: text only, length, in-a-row, rate, closing and going quiet", async () => {
    const asker = await member();
    const helper = await member();
    const { requestId, askOf } = await referral(asker, [helper]);
    await req("POST", `/v1/broker-asks/${askOf(helper)}/respond`, helper, { action: "accept" });

    // Text only, not empty, not too long.
    expect((await send(asker, requestId, "   ")).json().code).toBe("BROKER_MESSAGE_EMPTY");
    expect((await send(asker, requestId, "x".repeat(BROKER_MESSAGE_MAX_CHARS + 1))).json().code).toBe("BROKER_MESSAGE_TOO_LONG");
    expect((await send(asker, requestId, "x".repeat(BROKER_MESSAGE_MAX_CHARS))).statusCode).toBe(201);
    const attachment = await req("POST", `/v1/broker-requests/${requestId}/conversation/messages`, asker, { body: "see file", attachmentUrl: "https://x.test/cv.pdf" });
    expect(attachment.statusCode).toBe(400);
    expect((await send(asker, requestId, 42)).statusCode).toBe(400);

    // At most BROKER_MESSAGE_MAX_UNANSWERED in a row; a reply resets it.
    for (let i = 1; i < BROKER_MESSAGE_MAX_UNANSWERED; i++) expect((await send(asker, requestId, `follow-up ${i}`)).statusCode).toBe(201);
    const chasing = await send(asker, requestId, "one more");
    expect(chasing.statusCode).toBe(429);
    expect(chasing.json().code).toBe("BROKER_MESSAGE_WAIT_FOR_REPLY");
    expect((await send(helper, requestId, "Got it, give me a day.")).statusCode).toBe(201);
    // Per-sender rate limit (across their brokered conversations): 5 sent so far, 5 more fit, then 429.
    for (let i = BROKER_MESSAGE_MAX_UNANSWERED; i < BROKER_MESSAGES_PER_WINDOW; i++) expect((await send(asker, requestId, `again ${i}`)).statusCode).toBe(201);
    expect((await send(helper, requestId, "ok")).statusCode).toBe(201);
    const fast = await send(asker, requestId, "and another");
    expect(fast.statusCode).toBe(429);
    expect(fast.json().code).toBe("BROKER_MESSAGE_RATE_LIMITED");
    expect(Number(fast.headers["retry-after"])).toBeGreaterThan(0);

    // Either person can close it: read-only for both, still readable.
    expect((await req("POST", `/v1/broker-requests/${requestId}/conversation/close`, helper)).statusCode).toBe(204);
    expect((await req("POST", `/v1/broker-requests/${requestId}/conversation/close`, asker)).statusCode).toBe(409);
    const closed = await send(asker, requestId, "wait");
    expect(closed.statusCode).toBe(409);
    expect(closed.json().code).toBe("BROKER_CONVERSATION_READ_ONLY");
    expect((await req("GET", `/v1/broker-requests/${requestId}/conversation`, asker)).json().conversation).toMatchObject({
      state: "read_only",
      readOnlyReason: "closed_by_them",
      canSend: false
    });
    expect((await req("GET", `/v1/broker-requests/${requestId}/conversation`, helper)).json().conversation.readOnlyReason).toBe("closed_by_you");
    const listed = (await req("GET", "/v1/broker-requests", asker)).json().requests[0];
    expect(listed.conversation).toMatchObject({ state: "read_only", readOnlyReason: "closed_by_them" });
  });

  it("goes read-only after the quiet period", async () => {
    const asker = await member();
    const helper = await member();
    const { requestId, askOf } = await referral(asker, [helper]);
    await req("POST", `/v1/broker-asks/${askOf(helper)}/respond`, helper, { action: "accept" });
    expect((await send(asker, requestId, "Hi! Thanks for saying yes.")).statusCode).toBe(201);
    const quiet = `${BROKER_CONVERSATION_INACTIVE_DAYS + 1} days`;
    await db.query(`UPDATE connection_threads SET created_at = now() - $2::interval WHERE broker_request_id = $1`, [requestId, quiet]);
    await db.query(
      `UPDATE connection_messages SET created_at = now() - $2::interval WHERE thread_id = (SELECT id FROM connection_threads WHERE broker_request_id = $1)`,
      [requestId, quiet]
    );
    const late = await send(helper, requestId, "Sorry, only just saw this");
    expect(late.statusCode).toBe(409);
    expect(late.json().code).toBe("BROKER_CONVERSATION_READ_ONLY");
    const view = (await req("GET", `/v1/broker-requests/${requestId}/conversation`, helper)).json().conversation;
    expect(view).toMatchObject({ state: "read_only", readOnlyReason: "inactive", readOnlyAt: null });
    expect(view.messages).toHaveLength(1);
  });

  it("notifications: a new ask, a yes, each new message and a request closing; never a decline", async () => {
    const asker = await member();
    const [decliner, helper] = [await member(), await member()];
    const { requestId, askOf } = await referral(asker, [decliner, helper]);

    // The helper hears about the ask (unseen, so it counts on the bell).
    const ask = (await notes(helper)).find((i) => i.kind === "broker_ask_received");
    expect(ask).toMatchObject({ unseen: true });

    // A decline: nothing for the asker, ever.
    await req("POST", `/v1/broker-asks/${askOf(decliner)}/respond`, decliner, { action: "decline" });
    expect(await notes(asker)).toEqual([]);
    expect((await req("GET", "/v1/notifications/summary", asker)).json()).toEqual({ count: 0, unseenCount: 0 });

    // A yes: the asker is told they're connected (and not by the generic "accepted your reachout").
    await req("POST", `/v1/broker-asks/${askOf(helper)}/respond`, helper, { action: "accept" });
    let asked = await notes(asker);
    expect(asked.map((i) => i.kind)).toEqual(["broker_request_connected"]);
    expect(asked[0]).toMatchObject({ requestId, unseen: true, helperPersonId: helper.id });
    expect(JSON.stringify(asked)).not.toContain(decliner.id);
    // The answered ask leaves the helper's list.
    expect((await notes(helper)).some((i) => i.kind === "broker_ask_received")).toBe(false);

    // A new message: the other person is notified; the sender is not.
    expect((await req("POST", "/v1/notifications/mark-all-seen", asker)).statusCode).toBe(200);
    await send(helper, requestId, "Happy to refer you. Send me the job ID?");
    asked = await notes(asker);
    const msg = asked.find((i) => i.kind === "broker_message_received")!;
    expect(msg).toMatchObject({ requestId, unseen: true, unreadCount: 1, lastMessagePreview: "Happy to refer you. Send me the job ID?" });
    expect((await req("GET", "/v1/notifications/summary", asker)).json().unseenCount).toBe(1);
    expect((await notes(helper)).some((i) => i.kind === "broker_message_received")).toBe(false);
    expect((await req("GET", "/v1/broker-requests", asker)).json().requests[0].conversation.unreadCount).toBe(1);

    // Reading the conversation clears it (mark as read), without "Mark all as seen".
    expect((await req("POST", `/v1/broker-requests/${requestId}/conversation/read`, asker)).statusCode).toBe(204);
    asked = await notes(asker);
    expect(asked.find((i) => i.kind === "broker_message_received")).toMatchObject({ unseen: false, unreadCount: 0 });
    expect((await req("GET", "/v1/notifications/summary", asker)).json().unseenCount).toBe(0);
    expect((await req("GET", "/v1/broker-requests", asker)).json().requests[0].conversation.unreadCount).toBe(0);

    // The asker replies: now the helper has the unseen message.
    await send(asker, requestId, "JOB-1234. Thank you!");
    expect((await notes(helper)).find((i) => i.kind === "broker_message_received")).toMatchObject({ unseen: true, unreadCount: 1 });
  });

  it("a request closing with no one available shows up from the notifications list alone", async () => {
    const asker = await member();
    const helper = await member();
    const { requestId } = await referral(asker, [helper]);
    await db.query(`UPDATE broker_requests SET expires_at = now() - interval '1 minute' WHERE id = $1`, [requestId]);
    // No broker list is opened first: the bell's own read closes it.
    const items = await notes(asker);
    expect(items.find((i) => i.kind === "broker_request_expired")).toMatchObject({ requestId, unseen: true });
    expect((await req("GET", `/v1/broker-requests/${requestId}/conversation`, asker)).statusCode).toBe(404);
  });
});
