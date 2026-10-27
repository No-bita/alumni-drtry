import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { env } from "../config/env.js";
import { isAppError } from "../lib/errors.js";
import { ContactRequestRepo } from "../repos/contactRequestRepo.js";
import type { ContactRequestService, NoteDeliveryChannel } from "../services/contactRequestService.js";
import type { MatchService } from "../services/matchService.js";
import { isDefiniteRejection, type OutboundMessage, type ReplyButton, type WhatsAppSender } from "./client.js";
import { LINK_TTL_MS, signLinkToken, verifyLinkToken } from "./linkToken.js";
import { WaRepo, type ClaimResult, type LinkStatus, type WaContactRow } from "./repo.js";

/**
 * WhatsApp pilot bot: an entry point into the website, built to stay inside the free tier.
 *
 * Cost rules: the bot only ever *replies* (free service tier, within 24 hours of the user's
 * message), one reply per user message. The single paid message is the note template to an
 * alum who opted in, under a hard monthly cap. Everything else goes by email or the website.
 */
export const MAX_ASKS_PER_DAY = 3;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export const MENU = {
  referral: "menu_referral",
  pause: "menu_pause",
  resume: "menu_resume",
  back: "menu_back"
} as const;

/** WhatsApp's limit for the text of a message with buttons. */
const BUTTON_BODY_MAX = 1024;
/** Words that leave search mode and show the menu. */
const MENU_WORDS = ["hi", "hello", "hey", "menu", "start"];

/** Short link codes: 8 letters/digits (62^8 ≈ 218 trillion). */
const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const isShortCode = (s: string) => /^[A-Za-z0-9]{8}$/.test(s);
function newShortCode(): string {
  let code = "";
  // Rejection sampling keeps every character equally likely.
  while (code.length < 8) {
    for (const b of randomBytes(16)) {
      if (b < 248 && code.length < 8) code += CODE_ALPHABET[b % 62];
    }
  }
  return code;
}

/** Template quick-reply payloads: "cr:<contactRequestId>:<action>". */
export type NoteAction = "accept_wa" | "accept_email" | "decline";
export const notePayload = (id: string, action: NoteAction) => `cr:${id}:${action}`;

type Inbound = {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
  interactive?: { type?: string; button_reply?: { id?: string } };
  button?: { payload?: string; text?: string };
};

type Status = {
  id: string;
  status: string;
  biz_opaque_callback_data?: string;
  pricing?: { billable?: boolean; category?: string };
  errors?: Array<{ code?: number | string }>;
};

export type WebhookPayload = {
  object?: string;
  entry?: Array<{ changes?: Array<{ value?: { messages?: Inbound[]; statuses?: Status[] } }> }>;
};

/**
 * The bot asked "Which company and role?", so its reply is read as "company, role":
 * - "acme labs, pm" → "Acme Labs" (the words before the first comma, any number of them)
 * - "meesho" → "Meesho" (no comma: the whole message, unless it named a role)
 * Only when it looks like a name (up to 5 words, 50 characters, no odd characters). Lowercase
 * words get a capital first letter; words typed with capitals stay as typed. Used only when the
 * matcher found no company (directory names, known names like "aws", and capitalised names come first).
 */
export function companyFromReply(text: string, mentionsRole: boolean): string | null {
  const comma = text.indexOf(",");
  if (comma < 0 && mentionsRole) return null;
  const part = (comma < 0 ? text : text.slice(0, comma)).trim().replace(/\s+/g, " ");
  if (part.length < 2 || part.length > 50) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N}&.' -]*$/u.test(part) || part.split(" ").length > 5) return null;
  return part
    .split(" ")
    .map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

const webBase = () => (env.MAGIC_LINK_BASE_URL ?? env.APP_BASE_URL).replace(/\/+$/, "");
const yy = (batch: number | null) => (batch ? `'${String(batch).slice(-2)}` : "");
const today = () => new Date().toISOString().slice(0, 10);

export class WhatsAppService implements NoteDeliveryChannel {
  private readonly repo: WaRepo;
  private readonly notes: ContactRequestRepo;

  constructor(
    private readonly pool: Pool,
    private readonly sender: WhatsAppSender,
    private readonly matchService: MatchService,
    private readonly contactRequests: ContactRequestService,
    private readonly enabled: boolean = env.WHATSAPP_ENABLED
  ) {
    this.repo = new WaRepo(pool);
    this.notes = new ContactRequestRepo(pool);
  }

  /**
   * Website link for this number: links it to the member after they sign in, then goes to `next`.
   * Sent as a short link (/w/<code>); the signed link and destination stay on our side.
   */
  async linkUrl(waId: string, next?: string): Promise<string> {
    const token = signLinkToken(waId);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = newShortCode();
      const saved = await this.repo.createShortLink({
        code,
        token,
        next: next ?? null,
        expiresAt: new Date(Date.now() + LINK_TTL_MS)
      });
      if (saved) return `${webBase()}/w/${code}`;
    }
    // Five collisions in a row is practically impossible; fall back to the full link.
    const params = new URLSearchParams({ t: token });
    if (next) params.set("next", next);
    return `${webBase()}/wa?${params.toString()}`;
  }

  /** A short code or a full signed link → the signed link, plus the destination stored with a short code. */
  private async resolveLink(tokenOrCode: string): Promise<{ token: string; next: string | null } | null> {
    if (isShortCode(tokenOrCode)) return this.repo.resolveShortLink(tokenOrCode);
    return { token: tokenOrCode, next: null };
  }

  /**
   * Web side, before asking "Link WhatsApp ending 3210?": what this token would do for this member.
   * null when the token is invalid or expired.
   */
  async checkLink(
    personId: string,
    tokenOrCode: string
  ): Promise<{ status: LinkStatus; numberHint: string; next: string | null } | null> {
    const link = await this.resolveLink(tokenOrCode);
    const t = link ? verifyLinkToken(link.token) : null;
    if (!link || !t) return null;
    return { status: await this.repo.linkStatus(t.waId, personId, t.nonce), numberHint: t.waId.slice(-4), next: link.next };
  }

  /** Web side, after the member confirms: link the number once. null when the token is invalid or expired. */
  async claimLink(personId: string, tokenOrCode: string): Promise<ClaimResult | null> {
    const link = await this.resolveLink(tokenOrCode);
    const t = link ? verifyLinkToken(link.token) : null;
    if (!t) return null;
    const client = await this.pool.connect();
    let status: ClaimResult;
    try {
      await client.query("BEGIN");
      status = await new WaRepo(client).claim(t.waId, personId, t.nonce);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      // Two links for the same member racing: the other one won.
      if ((err as { code?: string }).code === "23505") return "you_have_another";
      throw err;
    } finally {
      client.release();
    }
    if (status === "linked") await this.repo.tagSignupFromWhatsApp(personId);
    return status;
  }

  async purgeExpiredLinks(): Promise<number> {
    return this.repo.purgeExpiredLinks();
  }

  async settingsFor(personId: string) {
    const c = await this.repo.byPerson(personId);
    return {
      linked: Boolean(c),
      /** Last 4 digits only. */
      numberHint: c ? c.wa_id.slice(-4) : null,
      notesOptedIn: Boolean(c?.notes_opted_in_at),
      notesPaused: Boolean(c?.notes_paused_at),
      stopped: Boolean(c?.stopped_at),
      botNumber: env.WA_BOT_NUMBER ?? null
    };
  }

  async updateSettings(personId: string, input: { notesOptedIn?: boolean; notesPaused?: boolean }): Promise<void> {
    if (input.notesOptedIn !== undefined) await this.repo.setOptInForPerson(personId, input.notesOptedIn);
    if (input.notesPaused !== undefined) await this.repo.setPausedForPerson(personId, input.notesPaused);
  }

  /* ------------------------------ webhook ------------------------------ */

  async handleWebhook(payload: WebhookPayload): Promise<void> {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const status of change.value?.statuses ?? []) {
          try {
            await this.handleStatus(status);
          } catch (err) {
            console.error("[whatsapp] status handling failed:", err instanceof Error ? err.message : err);
          }
        }
        for (const msg of change.value?.messages ?? []) {
          try {
            await this.handleInbound(msg);
          } catch (err) {
            console.error("[whatsapp] inbound handling failed:", err instanceof Error ? err.message : err);
          }
        }
      }
    }
  }

  private async handleStatus(status: Status): Promise<void> {
    if (!status.id || !status.status) return;
    const callback = /^cr:([0-9a-f-]{36})$/.exec(status.biz_opaque_callback_data ?? "");
    const update = {
      waMessageId: status.id,
      status: status.status,
      pricingCategory: status.pricing?.category ?? null,
      billable: typeof status.pricing?.billable === "boolean" ? status.pricing.billable : null,
      errorCode: status.errors?.[0]?.code != null ? String(status.errors[0].code) : null
    };
    let row = await this.repo.updateStatus(update);
    // A note whose send timed out: we never got Meta's id, but Meta sends back our note id.
    if (!row && callback && (await this.repo.attachUncertainNote(callback[1]!, status.id))) {
      row = await this.repo.updateStatus(update);
    }
    // Meta took the note but couldn't deliver it: tell the alum by email instead (once).
    const noteId = row?.contactRequestId ?? callback?.[1] ?? null;
    if (status.status === "failed" && noteId) {
      await this.contactRequests.emailNoteAfterWhatsAppFailure(noteId);
    }
  }

  private async handleInbound(msg: Inbound): Promise<void> {
    if (!msg.id || !/^[0-9]{8,15}$/.test(msg.from ?? "")) return;
    const fresh = await this.repo.recordInbound(msg.id, msg.from, msg.type ?? "other");
    if (!fresh) return; // Meta re-delivered it

    const contact = await this.repo.touchInbound(msg.from);
    const text = (msg.text?.body ?? "").trim();
    const word = text.toLowerCase();

    if (word === "stop") {
      await this.repo.setStopped(contact.wa_id, true);
      await this.reply(contact.wa_id, { kind: "text", body: "Done. You won't get WhatsApp messages from us. Text START any time to turn them back on." });
      return;
    }
    if (word === "start") {
      await this.repo.setStopped(contact.wa_id, false);
      contact.stopped_at = null;
    }
    if (contact.stopped_at) return; // they asked for silence

    // An alum answering a note (template button). Handled whatever else is going on.
    const payload = msg.button?.payload ?? "";
    if (msg.type === "button" && payload.startsWith("cr:")) {
      await this.handleNoteAction(contact, payload);
      return;
    }

    // Linked to an account that's closed: numbers never move, so don't offer a link that can't work.
    if (contact.person_id && !contact.person_live) {
      await this.reply(contact.wa_id, {
        kind: "text",
        body: "This number is linked to an Alma Mater account that's no longer active, so it can't be used here."
      });
      return;
    }
    // Not a member yet: the website is the way in.
    if (!contact.person_id) {
      await this.reply(contact.wa_id, {
        kind: "link",
        body: "Welcome to Alma Mater, the IIT BHU alumni network. Join on our website in about 2 minutes: sign in with your IIT BHU email and set up your profile.",
        label: "Join Alma Mater",
        url: await this.linkUrl(contact.wa_id)
      });
      return;
    }
    if (!contact.onboarding_completed_at) {
      await this.reply(contact.wa_id, {
        kind: "link",
        body: "You're almost there. Finish your profile on the website, then text hi here.",
        label: "Finish profile",
        url: await this.linkUrl(contact.wa_id)
      });
      return;
    }

    const buttonId = msg.interactive?.button_reply?.id ?? "";
    if (buttonId === MENU.referral) {
      await this.repo.setState(contact.wa_id, { ...contact.state, step: "awaiting_referral" });
      await this.reply(contact.wa_id, {
        kind: "text",
        body: "Which company and role? For example: Razorpay, product manager"
      });
      return;
    }
    if (buttonId === MENU.back) {
      await this.sendMenu(contact);
      return;
    }
    if (buttonId === MENU.pause || buttonId === MENU.resume) {
      const pause = buttonId === MENU.pause;
      await this.repo.setPausedForPerson(contact.person_id, pause);
      await this.reply(contact.wa_id, {
        kind: "text",
        body: pause
          ? "Paused. Referral asks will come by email instead. Text hi to resume."
          : "Resumed. You'll get referral asks here again."
      });
      return;
    }

    // In search: any text is another company, until hi / menu (or the Back to menu button).
    if (contact.state.step === "awaiting_referral" && text && !MENU_WORDS.includes(word)) {
      await this.handleReferralAsk(contact, text);
      return;
    }

    await this.sendMenu(contact);
  }

  private async sendMenu(contact: WaContactRow): Promise<void> {
    const first = (contact.full_name ?? "").trim().split(/\s+/)[0];
    const buttons: ReplyButton[] = [{ id: MENU.referral, title: "Ask for a referral" }];
    if (contact.notes_opted_in_at) {
      buttons.push(
        contact.notes_paused_at
          ? { id: MENU.resume, title: "Resume WhatsApp notes" }
          : { id: MENU.pause, title: "Pause WhatsApp notes" }
      );
    }
    await this.repo.setState(contact.wa_id, { ...contact.state, step: undefined });
    await this.reply(contact.wa_id, {
      kind: "buttons",
      body: `Hi${first ? ` ${first}` : ""}! What would you like to do today?`,
      buttons
    });
  }

  private async handleReferralAsk(contact: WaContactRow, text: string): Promise<void> {
    const day = today();
    const count = contact.state.askDay === day ? (contact.state.askCount ?? 0) : 0;
    if (count >= MAX_ASKS_PER_DAY) {
      // Out of search, so the next message gets the menu instead of this again.
      await this.repo.setState(contact.wa_id, { askDay: day, askCount: count });
      await this.reply(contact.wa_id, {
        kind: "text",
        body: `That's ${MAX_ASKS_PER_DAY} asks today, the daily limit here. You can keep going on the website: ${webBase()}/home`
      });
      return;
    }

    const question = `Referral at ${text}`.slice(0, 500);
    const ask = (company?: string) =>
      this.matchService.match({
        question,
        overrides: company ? { category: "referral", company } : { category: "referral" },
        viewerPersonId: contact.person_id!,
        viewerIsDemo: false
      });
    let result = await ask();
    // Not recognised: read the reply as "company, role" (see companyFromReply).
    if (!result.intent.company) {
      const typed = companyFromReply(text, Boolean(result.intent.role));
      if (typed) result = await ask(typed);
    }

    if (!result.intent.company) {
      // Keep waiting for the company; this does not use up one of the day's asks.
      await this.repo.setState(contact.wa_id, { step: "awaiting_referral", askDay: day, askCount: count });
      await this.replyWithBack(contact.wa_id, "Which company? Please include its name, for example: Razorpay, product manager");
      return;
    }

    // Stay in search: the next message is another company, until hi / menu / Back to menu.
    await this.repo.setState(contact.wa_id, { step: "awaiting_referral", askDay: day, askCount: count + 1 });
    const top = result.results.slice(0, 3);
    if (top.length === 0) {
      await this.replyWithBack(
        contact.wa_id,
        `No one on Alma Mater matches a referral at ${result.intent.company} yet. Type another company, or post it on the Wall: ${webBase()}/home`
      );
      return;
    }

    const lines: string[] = [];
    for (const [i, r] of top.entries()) {
      const headline = [r.headlineRoleTitle, r.headlineOrganizationName].filter(Boolean).join(" · ");
      // Carry the bot's reading (company, referral) so the website shows the same list; `reach` opens
      // the chosen alum's note box even if they've since dropped out of that list.
      const next = `/match?${new URLSearchParams({
        q: question,
        cat: "referral",
        company: result.intent.company,
        reach: r.id,
        via: "whatsapp"
      }).toString()}`;
      const link = await this.linkUrl(contact.wa_id, next);
      lines.push(
        `${i + 1}. ${r.fullName}${r.batchYear ? ` (${yy(r.batchYear)})` : ""}${headline ? `\n${headline}` : ""}\nWhy: ${r.whyThem}\nSend a note: ${link}`
      );
    }
    await this.replyWithBack(
      contact.wa_id,
      `Here's who can help with a referral at ${result.intent.company}:\n\n${lines.join("\n\n")}\n\nNotes are written on the website. Type another company to search again.`
    );
  }

  /**
   * One reply with a "Back to menu" button. WhatsApp allows 1,024 characters with buttons; a longer
   * message goes as plain text with a line saying how to get back instead (never cut short).
   */
  private async replyWithBack(waId: string, body: string): Promise<void> {
    if (body.length <= BUTTON_BODY_MAX) {
      await this.reply(waId, { kind: "buttons", body, buttons: [{ id: MENU.back, title: "Back to menu" }] });
      return;
    }
    await this.reply(waId, { kind: "text", body: `${body}\nType menu to go back.` });
  }

  private async handleNoteAction(contact: WaContactRow, payload: string): Promise<void> {
    const [, id, action] = payload.split(":") as [string, string, NoteAction];
    if (!contact.person_id || !id || !["accept_wa", "accept_email", "decline"].includes(action)) return;
    const note = await this.notes.findByIdWithPeople(id);
    if (!note || note.recipientPersonId !== contact.person_id) return;

    try {
      await this.contactRequests.respondToRequest(contact.person_id, id, {
        action: action === "decline" ? "decline" : "accept",
        ...(action === "accept_wa" ? { sharedContactOverride: `+${contact.wa_id}` } : {})
      });
    } catch (err) {
      if (isAppError(err) && err.code === "CONTACT_REQUEST_ALREADY_RESOLVED") {
        await this.reply(contact.wa_id, { kind: "text", body: "You've already answered this note." });
        return;
      }
      throw err;
    }

    const asker = note.senderFullName?.trim() || "They";
    const alum = note.recipientFullName?.trim() || "The alum";
    await this.reply(contact.wa_id, {
      kind: "text",
      body:
        action === "decline"
          ? "Declined. We'll let them know kindly."
          : `Done. ${asker} now has your ${action === "accept_wa" ? "WhatsApp number" : "email"}.`
    });

    // Tell the asker on WhatsApp only when it's free (they messaged us in the last 24 hours).
    // They always get the usual email from the notes flow.
    const askerContact = await this.repo.byPerson(note.senderPersonId);
    if (!askerContact || askerContact.stopped_at || !this.withinWindow(askerContact)) return;
    const updated = await this.notes.findByIdWithPeople(id);
    await this.reply(askerContact.wa_id, {
      kind: "text",
      body:
        action === "decline"
          ? `${alum} can't help with this one right now. Text hi to find someone else.`
          : `${alum} accepted your note. Contact: ${updated?.recipientContactShared ?? "see your notes on the website"}`
    });
  }

  /* ------------------------- notes to alumni (paid) ------------------------- */

  /** NoteDeliveryChannel: the one paid message, only for alumni who opted in, under the monthly cap. */
  async trySendNote(input: {
    contactRequestId: string;
    recipientPersonId: string;
    senderName: string;
    senderBatchYear: number | null;
    message: string;
  }): Promise<boolean> {
    if (!this.enabled) return false;
    const c = await this.repo.byPerson(input.recipientPersonId);
    if (!c || !c.notes_opted_in_at || c.notes_paused_at || c.stopped_at) return false;
    if ((await this.repo.templatesThisMonth()) >= env.WA_MONTHLY_TEMPLATE_CAP) return false;

    const who = `${input.senderName}${input.senderBatchYear ? ` (${yy(input.senderBatchYear)})` : ""}`;
    const message: OutboundMessage = {
      kind: "template",
      name: env.WA_TEMPLATE_NOTE,
      language: env.WA_TEMPLATE_LANG,
      bodyParams: [who, input.message.replace(/\s+/g, " ").slice(0, 700)],
      buttonPayloads: [
        notePayload(input.contactRequestId, "accept_wa"),
        notePayload(input.contactRequestId, "accept_email"),
        notePayload(input.contactRequestId, "decline")
      ],
      callbackData: `cr:${input.contactRequestId}`
    };
    return this.send(c.wa_id, message, input.contactRequestId);
  }

  /** Free "You're in" reply when a member finishes onboarding while their chat window is open. */
  async notifyOnboarded(personId: string): Promise<void> {
    if (!this.enabled) return;
    const c = await this.repo.byPerson(personId);
    if (!c || c.stopped_at || !this.withinWindow(c)) return;
    await this.reply(c.wa_id, { kind: "text", body: "You're in! Text hi any time to ask for a referral." });
  }

  /* ------------------------------- sending ------------------------------- */

  private withinWindow(c: WaContactRow): boolean {
    return c.last_inbound_at != null && Date.now() - new Date(c.last_inbound_at).getTime() < WINDOW_MS - 60_000;
  }

  /** Replies to an inbound message (free service tier). */
  private async reply(waId: string, message: OutboundMessage): Promise<void> {
    if (!this.enabled) return;
    await this.send(waId, message, null);
  }

  private async send(waId: string, message: OutboundMessage, contactRequestId: string | null): Promise<boolean> {
    const kind = message.kind === "template" ? "template" : message.kind === "text" ? "text" : "interactive";
    let id: string;
    try {
      id = await this.sender.send(waId, message);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[whatsapp] send failed:", detail);
      // A timeout may still have gone out: "uncertain" counts toward the cap, and Meta's later
      // status update (matched by our note id) fills in what happened. The caller emails either way.
      await this.repo.recordOutbound({
        waMessageId: null,
        waId,
        kind,
        template: message.kind === "template" ? message.name : null,
        status: isDefiniteRejection(err) ? "failed" : "uncertain",
        errorCode: detail.slice(0, 120),
        contactRequestId
      });
      return false;
    }
    // Sent: a logging problem must not make the caller think it failed (that would double-notify).
    await this.repo
      .recordOutbound({
        waMessageId: id,
        waId,
        kind,
        template: message.kind === "template" ? message.name : null,
        status: "accepted",
        contactRequestId
      })
      .catch((err: unknown) => console.error("[whatsapp] could not log a sent message:", err instanceof Error ? err.message : err));
    return true;
  }
}
