import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { createApp } from "../src/app.js";
import { ConsoleEmailSender } from "../src/services/emailSender.js";
import { RecordingSender, WhatsAppRejectedError, toGraphPayload, type OutboundMessage } from "../src/whatsapp/client.js";
import { signLinkToken, verifyLinkToken, verifyWebhookSignature } from "../src/whatsapp/linkToken.js";
import { MAX_ASKS_PER_DAY, MENU } from "../src/whatsapp/service.js";
import { loginForTest } from "./helpers/login.js";

type App = Awaited<ReturnType<typeof createApp>>;
type Who = { cookie: string; personId: string };

const run = Date.now();
const SECRET = "test_app_secret";
const ORG = `Wavely${run}`;
const wa = (n: number) => `9${String(run).slice(-12)}${n}`;

let msgSeq = 0;
const nextId = () => `wamid.in.${run}.${++msgSeq}`;
const textMsg = (from: string, body: string) => ({ id: nextId(), from, type: "text", text: { body } });
const buttonMsg = (from: string, id: string) => ({
  id: nextId(),
  from,
  type: "interactive",
  interactive: { type: "button_reply", button_reply: { id, title: "x" } },
});
const templateTap = (from: string, payload: string) => ({ id: nextId(), from, type: "button", button: { payload, text: "x" } });
const payload = (messages: unknown[]) => ({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { messages } }] }] });

describe("WhatsApp bot (integration)", () => {
  let app: App;
  let db: Pool;
  const sender = new RecordingSender();
  let asker: Who;
  let alum: Who;
  let other: Who;
  const ASKER = wa(1);
  const ALUM = wa(2);
  const OTHER = wa(3);

  const hear = async (...messages: unknown[]) => {
    const before = sender.sent.length;
    await app.whatsappService.handleWebhook(payload(messages));
    return sender.sent.slice(before);
  };
  const body = (m: OutboundMessage) => ("body" in m ? m.body : "");
  const tokenIn = (url: string) => new URL(url).searchParams.get("t")!;
  const req = (method: "GET" | "POST" | "PATCH", url: string, cookie: string, p?: object) =>
    app.inject({ method, url, headers: { cookie }, ...(p ? { payload: p } : {}) });
  const onboard = (p: Who, name: string) =>
    db.query(
      `UPDATE people SET full_name = $2, profile_completed_at = now(), onboarding_completed_at = now(), batch_year = 2019 WHERE id = $1`,
      [p.personId, `${name} ${run}`]
    );
  const linkVia = async (p: Who, waId: string) => {
    const res = await req("POST", "/v1/me/whatsapp-link", p.cookie, { token: signLinkToken(waId) });
    expect(res.statusCode, res.body).toBe(200);
  };

  beforeAll(async () => {
    app = await createApp({ whatsapp: { sender, enabled: true, appSecret: SECRET, verifyToken: "verify-me" } });
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    // Earlier runs' test templates would otherwise fill this month's cap in the test database.
    await db.query(`DELETE FROM wa_messages WHERE kind = 'template' AND (wa_message_id LIKE 'wamid.test.%' OR wa_message_id IS NULL OR template = 'cap-test')`);
    asker = await loginForTest(app, `wa-asker-${run}@iitbhu.ac.in`);
    alum = await loginForTest(app, `wa-alum-${run}@iitbhu.ac.in`);
    other = await loginForTest(app, `wa-other-${run}@iitbhu.ac.in`);
    await onboard(asker, "Asha Asker");
    await onboard(alum, "Arun Alum");
    await onboard(other, "Omar Other");
    const ft = (await db.query<{ id: string }>(`SELECT id FROM occupation_types WHERE code = 'full_time_employment'`)).rows[0]!.id;
    const org = (await db.query<{ id: string }>(`INSERT INTO organizations (name, approval_status) VALUES ($1, 'approved') RETURNING id`, [ORG])).rows[0]!.id;
    await db.query(
      `INSERT INTO occupations (person_id, occupation_type_id, organization_id, role_title, is_current) VALUES ($1, $2, $3, 'Product Manager', true)`,
      [alum.personId, ft, org]
    );
    await db.query(`UPDATE people SET open_to_preferences = $2::jsonb WHERE id = $1`, [
      alum.personId,
      JSON.stringify({ selected: ["referrals"], descriptions: {} }),
    ]);
  });

  afterAll(async () => {
    await db?.end();
    await app?.close();
  });

  beforeEach(() => vi.restoreAllMocks());

  it("webhook: Meta's verification handshake and signature check", async () => {
    const ok = await app.inject({ method: "GET", url: "/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42" });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toBe("42");
    expect((await app.inject({ method: "GET", url: "/v1/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1" })).statusCode).toBe(403);

    const raw = JSON.stringify(payload([textMsg(wa(7), "hi")]));
    const sig = `sha256=${createHmac("sha256", SECRET).update(raw).digest("hex")}`;
    const post = (signature?: string) =>
      app.inject({ method: "POST", url: "/v1/whatsapp/webhook", payload: raw, headers: { "content-type": "application/json", ...(signature ? { "x-hub-signature-256": signature } : {}) } });
    expect((await post()).statusCode).toBe(403);
    expect((await post("sha256=deadbeef")).statusCode).toBe(403);
    expect((await post(sig)).statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 100));
    const seen = await db.query(`SELECT 1 FROM wa_messages WHERE wa_id = $1 AND direction = 'in'`, [wa(7)]);
    expect(seen.rowCount).toBe(1);
    // Other routes still parse JSON normally.
    expect((await req("GET", "/v1/me/whatsapp", asker.cookie)).statusCode).toBe(200);
  });

  it("a new number gets one reply: the Join link, carrying a signed token for that number", async () => {
    const out = await hear(textMsg(ASKER, "hi"));
    expect(out).toHaveLength(1);
    const m = out[0]!.message;
    expect(m.kind).toBe("link");
    if (m.kind !== "link") return;
    expect(m.label).toBe("Join Alma Mater");
    expect(m.url).toContain("/wa?t=");
    expect(verifyLinkToken(tokenIn(m.url))?.waId).toBe(ASKER);
  });

  it("ignores Meta re-delivering the same message", async () => {
    const msg = textMsg(wa(8), "hi");
    expect(await hear(msg)).toHaveLength(1);
    expect(await hear(msg)).toHaveLength(0);
  });

  it("linking on the website; bad tokens are refused; brand-new members are tagged as arriving from WhatsApp", async () => {
    expect((await req("POST", "/v1/me/whatsapp-link", asker.cookie, { token: "x.y.z.invalid-token" })).statusCode).toBe(400);
    expect((await req("POST", "/v1/me/whatsapp-link", asker.cookie, { token: signLinkToken(ASKER, Date.now() - 2 * 86_400_000) })).statusCode).toBe(400);
    await linkVia(asker, ASKER);
    await linkVia(alum, ALUM);
    await linkVia(other, OTHER);
    const s = (await req("GET", "/v1/me/whatsapp", asker.cookie)).json() as { whatsapp: { linked: boolean; numberHint: string } };
    expect(s.whatsapp).toMatchObject({ linked: true, numberHint: ASKER.slice(-4) });
    const tag = await db.query<{ signup_channel: string }>(`SELECT signup_channel FROM people WHERE id = $1`, [asker.personId]);
    expect(tag.rows[0]!.signup_channel).toBe("whatsapp");
  });

  it("links: the website asks first (last 4 digits); a link works once; a linked number never moves", async () => {
    const a = await loginForTest(app, `wa-link-a-${run}@iitbhu.ac.in`);
    const b = await loginForTest(app, `wa-link-b-${run}@iitbhu.ac.in`);
    const NUM = wa(10);
    const token = signLinkToken(NUM);
    const check = async (p: Who, t: string) =>
      ((await req("POST", "/v1/me/whatsapp-link/check", p.cookie, { token: t })).json() as { link: { status: string; numberHint: string } }).link;

    expect(await check(a, token)).toEqual({ status: "ready", numberHint: NUM.slice(-4) });
    expect((await req("POST", "/v1/me/whatsapp-link/check", a.cookie, { token: "bad.token.value" })).statusCode).toBe(400);
    // Checking links nothing.
    expect(((await req("GET", "/v1/me/whatsapp", a.cookie)).json() as { whatsapp: { linked: boolean } }).whatsapp.linked).toBe(false);

    expect((await req("POST", "/v1/me/whatsapp-link", a.cookie, { token })).statusCode).toBe(200);
    // The same link again, same member: nothing to do (the asker's own Send-note links keep working).
    expect(await check(a, token)).toMatchObject({ status: "already_yours" });
    expect((await req("POST", "/v1/me/whatsapp-link", a.cookie, { token })).statusCode).toBe(200);

    // Forwarded to someone else: refused, nothing moves.
    expect(await check(b, token)).toMatchObject({ status: "linked_elsewhere" });
    const taken = await req("POST", "/v1/me/whatsapp-link", b.cookie, { token });
    expect(taken.statusCode).toBe(409);
    expect((taken.json() as { code: string }).code).toBe("WHATSAPP_NUMBER_TAKEN");
    expect((await db.query<{ person_id: string }>(`SELECT person_id FROM wa_contacts WHERE wa_id = $1`, [NUM])).rows[0]!.person_id).toBe(a.personId);

    // A member keeps their first number.
    const second = await req("POST", "/v1/me/whatsapp-link", a.cookie, { token: signLinkToken(wa(11)) });
    expect((second.json() as { code: string }).code).toBe("WHATSAPP_ALREADY_LINKED");

    // An admin unlinks by hand: the old link stays used; a new link works and starts settings fresh (STOP stays).
    await db.query(`UPDATE wa_contacts SET notes_opted_in_at = now(), stopped_at = now() WHERE wa_id = $1`, [NUM]);
    await db.query(`UPDATE wa_contacts SET person_id = NULL WHERE wa_id = $1`, [NUM]);
    const used = await req("POST", "/v1/me/whatsapp-link", b.cookie, { token });
    expect((used.json() as { code: string }).code).toBe("WHATSAPP_LINK_USED");
    expect((await req("POST", "/v1/me/whatsapp-link", b.cookie, { token: signLinkToken(NUM) })).statusCode).toBe(200);
    const s = ((await req("GET", "/v1/me/whatsapp", b.cookie)).json() as { whatsapp: { notesOptedIn: boolean; stopped: boolean } }).whatsapp;
    expect(s).toMatchObject({ notesOptedIn: false, stopped: true });
  });

  it("a number linked to a closed account is told so, not sent a Join link that can't work", async () => {
    const c = await loginForTest(app, `wa-closed-${run}@iitbhu.ac.in`);
    await linkVia(c, wa(12));
    await db.query(`UPDATE people SET deleted_at = now() WHERE id = $1`, [c.personId]);
    const out = await hear(textMsg(wa(12), "hi"));
    expect(out).toHaveLength(1);
    expect(out[0]!.message.kind).toBe("text");
    expect(body(out[0]!.message)).toContain("no longer active");
  });

  it("sign-in started from a WhatsApp link: the email's sign-in link carries the WhatsApp step", async () => {
    const t = signLinkToken(wa(13));
    const start = async (whatsappEntry: object) =>
      new URL(
        ((await app.inject({ method: "POST", url: "/v1/auth/start", payload: { institutionalEmail: `wa-mail-${run}-${Math.random().toString(36).slice(2, 7)}@iitbhu.ac.in`, whatsappEntry } })).json() as {
          debug: { magicLinkUrl: string };
        }).debug.magicLinkUrl,
      );
    const link = await start({ token: t, next: "/match?q=x" });
    expect(link.searchParams.get("wa")).toBe(t);
    expect(link.searchParams.get("waNext")).toBe("/match?q=x");
    // Forged tokens and off-site paths never go into the email.
    expect((await start({ token: "forged.token.value" })).searchParams.get("wa")).toBeNull();
    expect((await start({ token: t, next: "//evil.example" })).searchParams.get("waNext")).toBeNull();
  });

  it("a linked member who hasn't finished onboarding is sent back to the website", async () => {
    const fresh = await loginForTest(app, `wa-fresh-${run}@iitbhu.ac.in`);
    await linkVia(fresh, wa(9));
    const out = await hear(textMsg(wa(9), "hi"));
    expect(out[0]!.message).toMatchObject({ kind: "link", label: "Finish profile" });
  });

  it("returning members get the menu; Pause appears once they opt in to notes", async () => {
    let out = await hear(textMsg(ASKER, "hi"));
    expect(out[0]!.message).toMatchObject({ kind: "buttons", buttons: [{ id: MENU.referral, title: "Ask for a referral" }] });
    expect(body(out[0]!.message)).toContain("Asha");
    await req("PATCH", "/v1/me/whatsapp", alum.cookie, { notesOptedIn: true });
    out = await hear(textMsg(ALUM, "hello"));
    expect(out[0]!.message).toMatchObject({
      kind: "buttons",
      buttons: [{ id: MENU.referral }, { id: MENU.pause, title: "Pause WhatsApp notes" }],
    });
  });

  it("referral ask: asks for the company, then replies once with the top matches and Send-note links", async () => {
    await hear(buttonMsg(ASKER, MENU.referral));
    let out = await hear(textMsg(ASKER, "product manager please"));
    expect(body(out[0]!.message)).toContain("Which company?");
    out = await hear(textMsg(ASKER, `${ORG}, product manager`));
    expect(out).toHaveLength(1);
    const text = body(out[0]!.message);
    expect(text).toContain(`Arun Alum ${run}`);
    const link = text.match(/Send a note: (\S+)/)![1]!;
    const next = new URL(link).searchParams.get("next")!;
    expect(next.startsWith("/match?")).toBe(true);
    const q = new URLSearchParams(next.slice("/match?".length));
    expect(q.get("reach")).toBe(alum.personId);
    expect(q.get("via")).toBe("whatsapp");
    expect(verifyLinkToken(new URL(link).searchParams.get("t")!)?.waId).toBe(ASKER);
  });

  it("caps referral asks per day", async () => {
    await db.query(`UPDATE wa_contacts SET state = $2::jsonb WHERE wa_id = $1`, [
      ASKER,
      JSON.stringify({ step: "awaiting_referral", askDay: new Date().toISOString().slice(0, 10), askCount: MAX_ASKS_PER_DAY }),
    ]);
    const out = await hear(textMsg(ASKER, `${ORG}, product manager`));
    expect(body(out[0]!.message)).toContain("daily limit");
    await db.query(`UPDATE wa_contacts SET state = '{}'::jsonb WHERE wa_id = $1`, [ASKER]);
  });

  it("notes: opted-in alum gets the paid template (no email); others get email; delivery channel is recorded", async () => {
    const emailSpy = vi.spyOn(ConsoleEmailSender.prototype, "sendContactRequestReceivedEmail");
    const before = sender.sent.length;
    const res = await req("POST", "/v1/contact-requests", asker.cookie, {
      recipientPersonId: alum.personId,
      message: "Hi Arun, could you refer me for the PM role?",
      source: "whatsapp",
      sourceCategory: "referral",
      sourceRank: 1,
    });
    expect(res.statusCode, res.body).toBe(201);
    const noteId = (res.json() as { contactRequest: { id: string } }).contactRequest.id;
    const t = sender.sent.slice(before).find((s) => s.to === ALUM)!.message;
    expect(t).toMatchObject({ kind: "template" });
    if (t.kind !== "template") return;
    expect(t.buttonPayloads).toEqual([`cr:${noteId}:accept_wa`, `cr:${noteId}:accept_email`, `cr:${noteId}:decline`]);
    expect(t.bodyParams[0]).toContain("Asha Asker");
    expect(emailSpy.mock.calls.map((c) => (c[0] as { to: string }).to)).toEqual([]);
    const row = await db.query<{ delivery_channel: string; source: string }>(`SELECT delivery_channel, source FROM contact_requests WHERE id = $1`, [noteId]);
    expect(row.rows[0]).toEqual({ delivery_channel: "whatsapp", source: "whatsapp" });

    const res2 = await req("POST", "/v1/contact-requests", asker.cookie, {
      recipientPersonId: other.personId,
      message: "Hi Omar, could we talk about your team?",
    });
    const id2 = (res2.json() as { contactRequest: { id: string } }).contactRequest.id;
    expect(emailSpy).toHaveBeenCalledTimes(1);
    const row2 = await db.query<{ delivery_channel: string }>(`SELECT delivery_channel FROM contact_requests WHERE id = $1`, [id2]);
    expect(row2.rows[0]!.delivery_channel).toBe("email");
  });

  it("alum taps 'Accept, share WhatsApp': note accepted with their number; both told for free (asker's window is open)", async () => {
    const note = (await db.query<{ id: string }>(
      `SELECT id FROM contact_requests WHERE sender_person_id = $1 AND recipient_person_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [asker.personId, alum.personId],
    )).rows[0]!;
    // Someone else tapping the alum's button does nothing.
    expect(await hear(templateTap(OTHER, `cr:${note.id}:accept_wa`))).toHaveLength(0);
    const out = await hear(templateTap(ALUM, `cr:${note.id}:accept_wa`));
    const row = await db.query<{ status: string; recipient_contact_shared: string }>(`SELECT status, recipient_contact_shared FROM contact_requests WHERE id = $1`, [note.id]);
    expect(row.rows[0]).toEqual({ status: "accepted", recipient_contact_shared: `+${ALUM}` });
    expect(body(out.find((o) => o.to === ALUM)!.message)).toContain("WhatsApp number");
    expect(body(out.find((o) => o.to === ASKER)!.message)).toContain(`+${ALUM}`);
    // Tapping again: already answered.
    const again = await hear(templateTap(ALUM, `cr:${note.id}:accept_wa`));
    expect(body(again[0]!.message)).toContain("already answered");
  });

  it("pause sends the next note by email; stop silences the bot until start", async () => {
    await hear(buttonMsg(ALUM, MENU.pause));
    const emailSpy = vi.spyOn(ConsoleEmailSender.prototype, "sendContactRequestReceivedEmail");
    const before = sender.sent.length;
    await req("POST", "/v1/contact-requests", other.cookie, { recipientPersonId: alum.personId, message: "Hello Arun, a quick question about PM." });
    expect(sender.sent.slice(before).some((s) => s.message.kind === "template")).toBe(false);
    expect(emailSpy).toHaveBeenCalledTimes(1);

    expect(body((await hear(textMsg(OTHER, "STOP")))[0]!.message)).toContain("won't get WhatsApp messages");
    expect(await hear(textMsg(OTHER, "hi"))).toHaveLength(0);
    expect((await hear(textMsg(OTHER, "start")))[0]!.message.kind).toBe("buttons");
  });

  it("the monthly cap sends notes by email once reached", async () => {
    await hear(buttonMsg(ALUM, MENU.resume));
    const existing = Number((await db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM wa_messages WHERE kind = 'template' AND status <> 'failed' AND created_at >= date_trunc('month', now())`,
    )).rows[0]!.c);
    const fill = Math.max(0, 300 - existing);
    await db.query(
      `INSERT INTO wa_messages (direction, wa_id, kind, template, status, created_at)
       SELECT 'out', $1, 'template', 'cap-test', 'accepted', now() FROM generate_series(1, $2)`,
      [`cap${run}`, fill],
    );
    const before = sender.sent.length;
    const res = await req("POST", "/v1/contact-requests", asker.cookie, { recipientPersonId: alum.personId, message: "Hi again Arun, one more question." });
    expect(res.statusCode, res.body).toBe(201);
    expect(sender.sent.slice(before).some((s) => s.message.kind === "template")).toBe(false);
    await db.query(`DELETE FROM wa_messages WHERE wa_id = $1`, [`cap${run}`]);
  });

  it("a note WhatsApp later reports as failed goes to the alum by email, once", async () => {
    const s2 = await loginForTest(app, `wa-s2-${run}@iitbhu.ac.in`);
    await onboard(s2, "Sana Second");
    const emailSpy = vi.spyOn(ConsoleEmailSender.prototype, "sendContactRequestReceivedEmail");
    const before = sender.sent.length;
    const res = await req("POST", "/v1/contact-requests", s2.cookie, { recipientPersonId: alum.personId, message: "Hi Arun, could you refer me for the PM role?" });
    expect(res.statusCode, res.body).toBe(201);
    const noteId = (res.json() as { contactRequest: { id: string } }).contactRequest.id;
    const tpl = sender.sent.slice(before).find((x) => x.message.kind === "template")!;
    expect(tpl.message).toMatchObject({ callbackData: `cr:${noteId}` });
    expect(emailSpy).not.toHaveBeenCalled();

    const failed = { id: tpl.id, status: "failed", biz_opaque_callback_data: `cr:${noteId}`, errors: [{ code: 131026 }] };
    await app.whatsappService.handleWebhook({ entry: [{ changes: [{ value: { statuses: [failed] } }] }] });
    await app.whatsappService.handleWebhook({ entry: [{ changes: [{ value: { statuses: [failed] } }] }] });
    expect(emailSpy).toHaveBeenCalledTimes(1);
    const row = await db.query<{ delivery_channel: string }>(`SELECT delivery_channel FROM contact_requests WHERE id = $1`, [noteId]);
    expect(row.rows[0]!.delivery_channel).toBe("email");
    // A late "delivered" never un-fails it.
    await app.whatsappService.handleWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: tpl.id, status: "delivered" }] } }] }] });
    expect((await db.query<{ status: string }>(`SELECT status FROM wa_messages WHERE wa_message_id = $1`, [tpl.id])).rows[0]!.status).toBe("failed");
  });

  it("no answer from WhatsApp in time: email at once, count it toward the cap, attach Meta's later status", async () => {
    const s3 = await loginForTest(app, `wa-s3-${run}@iitbhu.ac.in`);
    await onboard(s3, "Sid Third");
    const emailSpy = vi.spyOn(ConsoleEmailSender.prototype, "sendContactRequestReceivedEmail");
    vi.spyOn(sender, "send").mockRejectedValueOnce(new Error("The operation was aborted due to timeout"));
    const res = await req("POST", "/v1/contact-requests", s3.cookie, { recipientPersonId: alum.personId, message: "Hi Arun, a question about PM roles." });
    const noteId = (res.json() as { contactRequest: { id: string } }).contactRequest.id;
    expect(emailSpy).toHaveBeenCalledTimes(1);
    const rec = async () =>
      (await db.query<{ status: string; wa_message_id: string | null }>(`SELECT status, wa_message_id FROM wa_messages WHERE contact_request_id = $1`, [noteId])).rows[0]!;
    expect(await rec()).toEqual({ status: "uncertain", wa_message_id: null });

    // It did go out after all: Meta's status update finds the note by our id.
    const late = `wamid.late.${run}`;
    await app.whatsappService.handleWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: late, status: "sent", biz_opaque_callback_data: `cr:${noteId}` }] } }] }] });
    expect(await rec()).toEqual({ status: "sent", wa_message_id: late });
    // Already emailed: a later failure doesn't email again.
    await app.whatsappService.handleWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: late, status: "failed", biz_opaque_callback_data: `cr:${noteId}` }] } }] }] });
    expect(emailSpy).toHaveBeenCalledTimes(1);
  });

  it("Meta refusing a note outright is recorded as failed (not counted toward the cap); the alum is emailed", async () => {
    const s4 = await loginForTest(app, `wa-s4-${run}@iitbhu.ac.in`);
    await onboard(s4, "Sam Fourth");
    const emailSpy = vi.spyOn(ConsoleEmailSender.prototype, "sendContactRequestReceivedEmail");
    vi.spyOn(sender, "send").mockRejectedValueOnce(new WhatsAppRejectedError("WhatsApp send failed (400): 132001"));
    const res = await req("POST", "/v1/contact-requests", s4.cookie, { recipientPersonId: alum.personId, message: "Hi Arun, could we chat about PM?" });
    const noteId = (res.json() as { contactRequest: { id: string } }).contactRequest.id;
    expect(emailSpy).toHaveBeenCalledTimes(1);
    expect((await db.query<{ status: string }>(`SELECT status FROM wa_messages WHERE contact_request_id = $1`, [noteId])).rows[0]!.status).toBe("failed");
  });

  it("'You're in' only when the chat window is open; delivery statuses update billing", async () => {
    const before = sender.sent.length;
    await app.whatsappService.notifyOnboarded(asker.personId);
    expect(body(sender.sent[before]!.message)).toContain("You're in");
    await db.query(`UPDATE wa_contacts SET last_inbound_at = now() - interval '2 days' WHERE wa_id = $1`, [ASKER]);
    await app.whatsappService.notifyOnboarded(asker.personId);
    expect(sender.sent.length).toBe(before + 1);

    const sentId = sender.sent[before]!.id;
    await app.whatsappService.handleWebhook({
      entry: [{ changes: [{ value: { statuses: [{ id: sentId, status: "delivered", pricing: { billable: false, category: "service" } }] } }] }],
    });
    const st = await db.query<{ status: string; pricing_category: string; billable: boolean }>(
      `SELECT status, pricing_category, billable FROM wa_messages WHERE wa_message_id = $1`,
      [sentId],
    );
    expect(st.rows[0]).toEqual({ status: "delivered", pricing_category: "service", billable: false });
    // Out of order: a late "sent" doesn't move it back.
    await app.whatsappService.handleWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: sentId, status: "sent" }] } }] }] });
    expect((await db.query<{ status: string }>(`SELECT status FROM wa_messages WHERE wa_message_id = $1`, [sentId])).rows[0]!.status).toBe("delivered");
  });

  it("the analytics screen gets the pilot numbers: notes by channel, arrivals, spend", async () => {
    const r = (await app.analyticsService.report(7, { fresh: true })).whatsapp;
    const wa = r.byChannel.find((c) => c.channel === "whatsapp")!;
    expect(wa.notes).toBeGreaterThanOrEqual(1);
    expect(wa.accepted).toBeGreaterThanOrEqual(1);
    expect(r.byChannel.find((c) => c.channel === "email")!.notes).toBeGreaterThanOrEqual(2);
    expect(r.onboardingByArrival.find((a) => a.arrival === "whatsapp")!.started).toBeGreaterThanOrEqual(1);
    expect(r.month.templates).toBeGreaterThanOrEqual(1);
    expect(r.month.templateCap).toBe(300);
    expect(r.notesFromBot).toBeGreaterThanOrEqual(1);
    expect(r.linkedMembers).toBeGreaterThanOrEqual(3);
  });
});

describe("WhatsApp helpers", () => {
  it("every link token carries its own nonce", () => {
    const a = verifyLinkToken(signLinkToken("919876543210"))!;
    const b = verifyLinkToken(signLinkToken("919876543210"))!;
    expect(a.nonce).not.toBe(b.nonce);
  });
  it("note templates carry the note id back in Meta's status updates", () => {
    const t = toGraphPayload("91", { kind: "template", name: "n", language: "en", bodyParams: ["a"], buttonPayloads: [], callbackData: "cr:1" });
    expect(t).toMatchObject({ biz_opaque_callback_data: "cr:1" });
  });
  it("link tokens can't be forged or reused after expiry", () => {
    const t = signLinkToken("919876543210", 0);
    expect(verifyLinkToken(t, 1000)?.waId).toBe("919876543210");
    expect(verifyLinkToken(t, 25 * 3600 * 1000)).toBeNull();
    const [p, s] = t.split(".");
    const forged = `${Buffer.from(JSON.stringify({ w: "911111111111", e: 9e15 })).toString("base64url")}.${s}`;
    expect(verifyLinkToken(forged, 1000)).toBeNull();
    expect(verifyLinkToken(`${p}.`, 1000)).toBeNull();
  });
  it("webhook signature uses the app secret over the raw body", () => {
    const raw = Buffer.from('{"a":1}');
    const sig = `sha256=${createHmac("sha256", "s").update(raw).digest("hex")}`;
    expect(verifyWebhookSignature(raw, sig, "s")).toBe(true);
    expect(verifyWebhookSignature(raw, sig, "other")).toBe(false);
    expect(verifyWebhookSignature(raw, undefined, "s")).toBe(false);
  });
  it("builds Cloud API payloads within Meta's limits", () => {
    const b = toGraphPayload("91", { kind: "buttons", body: "x", buttons: [1, 2, 3, 4].map((i) => ({ id: `b${i}`, title: "A very long button title here" })) }) as {
      interactive: { action: { buttons: Array<{ reply: { title: string } }> } };
    };
    expect(b.interactive.action.buttons).toHaveLength(3);
    expect(b.interactive.action.buttons[0]!.reply.title.length).toBeLessThanOrEqual(20);
    const t = toGraphPayload("91", { kind: "template", name: "n", language: "en", bodyParams: ["a"], buttonPayloads: ["p0", "p1"] }) as {
      template: { components: Array<{ type: string; index?: string }> };
    };
    expect(t.template.components.map((c) => c.type)).toEqual(["body", "button", "button"]);
    expect(t.template.components[2]!.index).toBe("1");
  });
});
