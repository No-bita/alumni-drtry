import type { Pool } from "pg";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import {
  ContactRequestRepo,
  type ContactRequestInboxItemView,
  type ContactRequestView,
  type ContactRequestSentView,
  type ContactRequestSource
} from "../repos/contactRequestRepo.js";
import { normalizeEmail } from "../lib/domainAllowlist.js";
import { personRowIsDemoProfile } from "../lib/demoPersonProfile.js";
import { PersonRepo } from "../repos/personRepo.js";
import { CitiesRepo } from "../repos/citiesRepo.js";
import { coffeeWeeklyLimit, parseOpenToPreferences } from "../lib/openToPreferences.js";
import type { EmailSender } from "./emailSender.js";

export interface CreateContactRequestInput {
  recipientPersonId: string;
  message: string;
  /** Surface the note was sent from (only "match" today) and the question category. */
  source?: ContactRequestSource;
  sourceCategory?: string | null;
  sourceRank?: number | null;
  /** Cities v1, newcomer notes: the offer this note answers. */
  cityHelpOfferId?: string | null;
}

/** Cities v1 note categories (source "cities"). */
export const CITIES_NOTE_CATEGORIES = ["coffee", "relocation", "visiting", "newcomer"] as const;
export type CitiesNoteCategory = (typeof CITIES_NOTE_CATEGORIES)[number];

/** A coffee ask must say why them: at least this many characters (the optional "When suits me" line excluded). */
export const COFFEE_REASON_MIN_CHARS = 40;
/** Most relocation/visiting asks a sender may have waiting at once, across all cities. */
export const CITY_HELP_PENDING_MAX = 3;

/** The reason part of a coffee ask: the note without its trailing "When suits me: …" line. */
export function coffeeReasonText(message: string): string {
  return message.replace(/\n+\s*When suits me:[^\n]*\s*$/i, "").trim();
}

/** How the email describes a Cities note (keyed by category). */
function citiesEmailLead(category: string | null | undefined): string | undefined {
  switch (category) {
    case "coffee":
      return "asked you for coffee";
    case "relocation":
      return "is moving to your city and asked for your help settling in";
    case "visiting":
      return "is visiting your city and asked for your help";
    case "newcomer":
      return "replied to your offer to help them settle in";
    default:
      return undefined;
  }
}

/** Reminder rules (approved): one email, for notes pending 3–14 days. */
export const CONTACT_REMINDER_MIN_DAYS = 3;
export const CONTACT_REMINDER_MAX_DAYS = 14;
const CONTACT_REMINDER_BATCH = 200;

/** Reply-stats rules (approved): last 12 months, pending < 3 days excluded, shown from 3 notes. */
export const REPLY_STATS_WINDOW_MONTHS = 12;
export const REPLY_STATS_GRACE_DAYS = 3;
export const REPLY_STATS_MIN_NOTES = 3;

export interface ReplyStatsView {
  /** Notes counted (last 12 months, excluding pending < 3 days). */
  total: number;
  /** Accepted or declined. */
  replied: number;
  /** Median days to reply, rounded up (min 1); null when nothing was replied to. */
  medianDays: number | null;
}

export interface RespondContactRequestInput {
  action: "accept" | "decline";
  /** Internal (WhatsApp buttons): share this contact instead of the alum's email. */
  sharedContactOverride?: string;
}

/** Another way to tell the alum about a new note (WhatsApp). Returns true when it was sent. */
export interface NoteDeliveryChannel {
  trySendNote(input: {
    contactRequestId: string;
    recipientPersonId: string;
    senderName: string;
    senderBatchYear: number | null;
    message: string;
  }): Promise<boolean>;
}

export interface ContactRequestActionResult {
  contactRequest: ContactRequestView;
  notificationDelivered: boolean;
}

export class ContactRequestService {
  private readonly contactRequestRepo: ContactRequestRepo;
  private readonly personRepo: PersonRepo;

  constructor(
    private readonly pool: Pool,
    private readonly emailSender: EmailSender
  ) {
    this.contactRequestRepo = new ContactRequestRepo(pool);
    this.personRepo = new PersonRepo(pool);
  }

  private noteChannel: NoteDeliveryChannel | null = null;

  /** Wire WhatsApp in after construction (it depends on this service for button replies). */
  setNoteChannel(channel: NoteDeliveryChannel | null): void {
    this.noteChannel = channel;
  }

  async createRequest(
    senderPersonId: string,
    input: CreateContactRequestInput
  ): Promise<ContactRequestActionResult> {
    const sender = await this.personRepo.findById(senderPersonId);
    if (!sender || sender.deleted_at || sender.suspended_at) {
      throw new AppError(403, "CONTACT_REQUEST_FORBIDDEN", "Sender account is not active.");
    }

    const recipient = await this.personRepo.findById(input.recipientPersonId);
    if (!recipient || recipient.deleted_at || recipient.suspended_at) {
      throw new AppError(404, "CONTACT_REQUEST_RECIPIENT_NOT_FOUND", "Recipient not found.");
    }

    if (sender.id === recipient.id) {
      throw new AppError(400, "CONTACT_REQUEST_SELF", "You cannot send a contact request to yourself.");
    }

    const message = input.message.trim();
    if (message.length < 10) {
      throw new AppError(
        400,
        "CONTACT_REQUEST_MESSAGE_TOO_SHORT",
        "Contextual note must be at least 10 characters."
      );
    }

    if (await this.contactRequestRepo.hasPendingBetween(sender.id, recipient.id)) {
      const name = recipient.full_name?.trim() || "this alum";
      throw new AppError(
        409,
        "CONTACT_REQUEST_DUPLICATE_PENDING",
        `You already have a note waiting for ${name}.`
      );
    }

    const maxOut = env.CONTACT_REQUEST_MAX_PER_SENDER_WINDOW;
    const recipientIsDemo = personRowIsDemoProfile(recipient);
    if (maxOut > 0 && !recipientIsDemo) {
      const recent = await this.contactRequestRepo.countOutgoingCreatedInWindow(
        senderPersonId,
        env.CONTACT_REQUEST_WINDOW_MINUTES
      );
      if (recent >= maxOut) {
        throw new AppError(
          429,
          "CONTACT_REQUEST_RATE_LIMITED",
          "Too many connection requests in a short period. Try again later.",
          true,
          env.CONTACT_REQUEST_WINDOW_MINUTES * 60
        );
      }
    }

    const createInput = {
      senderPersonId: sender.id,
      recipientPersonId: recipient.id,
      message,
      forwardedToInstitutionalEmail: recipient.institutional_email,
      source: input.source ?? null,
      sourceCategory: input.source ? (input.sourceCategory ?? null) : null,
      sourceRank: input.source ? (input.sourceRank ?? null) : null
    };
    const created =
      input.source === "cities"
        ? await this.createCitiesNote(createInput, input.sourceCategory ?? null, input.cityHelpOfferId ?? null)
        : await this.contactRequestRepo.create(createInput);

    // WhatsApp first when the alum opted in (and within the monthly cap); otherwise email, as before.
    let channel: "email" | "whatsapp" = "email";
    if (this.noteChannel) {
      try {
        const sent = await this.noteChannel.trySendNote({
          contactRequestId: created.id,
          recipientPersonId: recipient.id,
          senderName: sender.full_name ?? "An IIT BHU alum",
          senderBatchYear: sender.batch_year,
          message
        });
        if (sent) channel = "whatsapp";
      } catch (err) {
        console.error("[contact-request] WhatsApp note failed, falling back to email:", err);
      }
    }

    let notificationDelivered = true;
    if (channel === "email") {
      try {
        await this.emailSender.sendContactRequestReceivedEmail({
          to: recipient.institutional_email,
          recipientName: recipient.full_name ?? "there",
          senderName: sender.full_name ?? sender.institutional_email,
          message,
          lead: input.source === "cities" ? citiesEmailLead(input.sourceCategory) : undefined
        });
      } catch (err) {
        notificationDelivered = false;
        console.error("[contact-request] recipient notification email failed (request still saved):", err);
      }
    }
    await this.contactRequestRepo.setDeliveryChannel(created.id, channel);

    return {
      contactRequest: created,
      notificationDelivered
    };
  }

  /**
   * Cities notes pass the reach-out principle: the recipient said yes to this kind of contact and the
   * sender gives a reason. Checks and insert run in one transaction with row locks, so two asks sent
   * at once cannot both take a recipient's last coffee spot (or a sender's last city-help slot).
   */
  private async createCitiesNote(
    createInput: Parameters<ContactRequestRepo["create"]>[0],
    category: string | null,
    cityHelpOfferId: string | null
  ): Promise<ContactRequestView> {
    if (!category || !(CITIES_NOTE_CATEGORIES as readonly string[]).includes(category)) {
      throw new AppError(400, "CONTACT_REQUEST_BAD_REQUEST", "Invalid Cities note category.");
    }
    const { senderPersonId, recipientPersonId, message } = createInput;
    if (category === "coffee" && coffeeReasonText(message).length < COFFEE_REASON_MIN_CHARS) {
      throw new AppError(
        400,
        "COFFEE_REASON_TOO_SHORT",
        `Say why them in at least ${COFFEE_REASON_MIN_CHARS} characters.`
      );
    }
    if (category === "newcomer" && !cityHelpOfferId) {
      throw new AppError(404, "OFFER_NOT_FOUND", "That offer is no longer available.");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cities = new CitiesRepo(client);
      const notes = new ContactRequestRepo(client);
      const prefs = parseOpenToPreferences((await cities.openToPreferences([recipientPersonId])).get(recipientPersonId));

      if (category === "coffee") {
        await cities.lockPerson(recipientPersonId);
        const limit = coffeeWeeklyLimit(prefs);
        if (limit === null) {
          throw new AppError(403, "COFFEE_NOT_OPEN", "This alum isn't taking coffee asks.");
        }
        const used = (await cities.coffeeAsksThisWeek([recipientPersonId])).get(recipientPersonId) ?? 0;
        if (used >= limit) {
          throw new AppError(409, "COFFEE_LIMIT_REACHED", "They're full this week. Try again from Monday.");
        }
      } else if (category === "relocation" || category === "visiting") {
        if (!prefs?.selected.includes("city_help")) {
          throw new AppError(403, "CITY_HELP_NOT_OPEN", "This alum isn't open to city help.");
        }
        await cities.lockPerson(senderPersonId);
        if ((await cities.pendingCityHelpAsks(senderPersonId)) >= CITY_HELP_PENDING_MAX) {
          throw new AppError(
            429,
            "CITY_ASK_LIMIT",
            `You have ${CITY_HELP_PENDING_MAX} asks waiting. Send more once they reply.`
          );
        }
      } else {
        const offer = await cities.offerById(cityHelpOfferId!);
        if (
          !offer ||
          offer.withdrawn_at !== null ||
          offer.arrival_person_id !== senderPersonId ||
          offer.offerer_person_id !== recipientPersonId
        ) {
          throw new AppError(404, "OFFER_NOT_FOUND", "That offer is no longer available.");
        }
      }

      // Same one-pending-note-per-pair rule as every other note, re-checked under the lock.
      if (await notes.hasPendingBetween(senderPersonId, recipientPersonId)) {
        throw new AppError(409, "CONTACT_REQUEST_DUPLICATE_PENDING", "You already have a note waiting for them.");
      }
      const created = await notes.create({
        ...createInput,
        cityHelpOfferId: category === "newcomer" ? cityHelpOfferId : null
      });
      await client.query("COMMIT");
      return created;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** WhatsApp reported the note as failed after taking it: tell the alum by email instead (once). */
  async emailNoteAfterWhatsAppFailure(contactRequestId: string): Promise<boolean> {
    if (!(await this.contactRequestRepo.switchPendingWhatsAppToEmail(contactRequestId))) return false;
    const note = await this.contactRequestRepo.findByIdWithPeople(contactRequestId);
    if (!note) return false;
    try {
      await this.emailSender.sendContactRequestReceivedEmail({
        to: note.forwardedToInstitutionalEmail,
        recipientName: note.recipientFullName ?? "there",
        senderName: note.senderFullName ?? note.senderInstitutionalEmail,
        message: note.message
      });
      return true;
    } catch (err) {
      // Same as a first-time email failure: the note is still on the website and the reminder still runs.
      console.error("[contact-request] fallback email after WhatsApp failure did not send:", err);
      return false;
    }
  }

  async listSentForSender(senderPersonId: string): Promise<ContactRequestSentView[]> {
    return this.contactRequestRepo.listSentForSender(senderPersonId, 100);
  }

  /** Latest status of the viewer's note to each recipient (for match cards). */
  async latestStatusFromSender(senderPersonId: string, recipientPersonIds: readonly string[]) {
    return this.contactRequestRepo.latestStatusFromSender(senderPersonId, recipientPersonIds);
  }

  /** Reply stats per recipient; only recipients with enough notes are included. */
  async replyStatsForRecipients(recipientPersonIds: readonly string[]): Promise<Map<string, ReplyStatsView>> {
    const rows = await this.contactRequestRepo.replyStatsForRecipients(
      recipientPersonIds,
      REPLY_STATS_WINDOW_MONTHS,
      REPLY_STATS_GRACE_DAYS
    );
    const out = new Map<string, ReplyStatsView>();
    for (const r of rows) {
      if (r.considered < REPLY_STATS_MIN_NOTES) continue;
      out.set(r.recipientPersonId, {
        total: r.considered,
        replied: r.replied,
        medianDays:
          r.replied > 0 && r.medianReplySeconds !== null ? Math.max(1, Math.ceil(r.medianReplySeconds / 86_400)) : null
      });
    }
    return out;
  }

  /** One reminder per pending note aged 3–14 days. Safe to run concurrently (claims are atomic). */
  async sendDueReminders(): Promise<{ sent: number; failed: number }> {
    const due = await this.contactRequestRepo.listRemindersDue(
      CONTACT_REMINDER_MIN_DAYS,
      CONTACT_REMINDER_MAX_DAYS,
      CONTACT_REMINDER_BATCH
    );
    let sent = 0;
    let failed = 0;
    for (const note of due) {
      if (!(await this.contactRequestRepo.claimReminder(note.id))) continue;
      try {
        await this.emailSender.sendContactRequestReminderEmail({
          to: note.recipientInstitutionalEmail,
          recipientName: note.recipientFullName?.trim() || "there",
          senderName: note.senderFullName?.trim() || note.senderInstitutionalEmail,
          message: note.message,
          daysWaiting: Math.max(1, Math.floor((Date.now() - note.createdAt.getTime()) / 86_400_000))
        });
        sent += 1;
      } catch (err) {
        failed += 1;
        await this.contactRequestRepo.releaseReminder(note.id);
        console.error("[contact-request] reminder email failed (will retry next run):", err);
      }
    }
    return { sent, failed };
  }

  async listInboxForRecipient(recipientPersonId: string): Promise<ContactRequestInboxItemView[]> {
    return this.contactRequestRepo.listPendingIncomingForRecipient(recipientPersonId);
  }

  async respondToRequest(
    actorPersonId: string,
    contactRequestId: string,
    input: RespondContactRequestInput
  ): Promise<ContactRequestActionResult> {
    const existing = await this.contactRequestRepo.findByIdWithPeople(contactRequestId);
    if (!existing) {
      throw new AppError(404, "CONTACT_REQUEST_NOT_FOUND", "Contact request not found.");
    }

    if (existing.recipientPersonId !== actorPersonId) {
      throw new AppError(403, "CONTACT_REQUEST_FORBIDDEN", "Only the recipient can respond.");
    }

    if (existing.status !== "pending") {
      throw new AppError(409, "CONTACT_REQUEST_ALREADY_RESOLVED", "Contact request is already resolved.");
    }

    if (input.action === "accept") {
      const sharedContact =
        input.sharedContactOverride?.trim() ||
        normalizeEmail(existing.recipientPersonalEmail ?? existing.recipientInstitutionalEmail);
      const updated = await this.contactRequestRepo.markAccepted(existing.id, sharedContact);
      if (!updated) {
        throw new AppError(409, "CONTACT_REQUEST_ALREADY_RESOLVED", "Contact request is already resolved.");
      }

      let notificationDelivered = true;
      try {
        await this.emailSender.sendContactRequestAcceptedEmail({
          to: existing.senderInstitutionalEmail,
          senderName: existing.senderFullName ?? existing.senderInstitutionalEmail,
          recipientName: existing.recipientFullName ?? existing.recipientInstitutionalEmail,
          sharedContact
        });
      } catch {
        notificationDelivered = false;
      }

      return {
        contactRequest: updated,
        notificationDelivered
      };
    }

    const updated = await this.contactRequestRepo.markDeclined(existing.id);
    if (!updated) {
      throw new AppError(409, "CONTACT_REQUEST_ALREADY_RESOLVED", "Contact request is already resolved.");
    }

    let notificationDelivered = true;
    try {
      await this.emailSender.sendContactRequestDeclinedEmail({
        to: existing.senderInstitutionalEmail,
        senderName: existing.senderFullName ?? existing.senderInstitutionalEmail,
        recipientName: existing.recipientFullName ?? existing.recipientInstitutionalEmail
      });
    } catch {
      notificationDelivered = false;
    }

    return {
      contactRequest: updated,
      notificationDelivered
    };
  }
}

