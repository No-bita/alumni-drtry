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
import type { EmailSender } from "./emailSender.js";

export interface CreateContactRequestInput {
  recipientPersonId: string;
  message: string;
  /** Surface the note was sent from (only "match" today) and the question category. */
  source?: ContactRequestSource;
  sourceCategory?: string | null;
  sourceRank?: number | null;
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

    const created = await this.contactRequestRepo.create({
      senderPersonId: sender.id,
      recipientPersonId: recipient.id,
      message,
      forwardedToInstitutionalEmail: recipient.institutional_email,
      source: input.source ?? null,
      sourceCategory: input.source ? (input.sourceCategory ?? null) : null,
      sourceRank: input.source ? (input.sourceRank ?? null) : null
    });

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
          message
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
