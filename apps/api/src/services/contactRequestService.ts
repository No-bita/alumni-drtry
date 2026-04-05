import type { Pool } from "pg";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import {
  ContactRequestRepo,
  type ContactRequestInboxItemView,
  type ContactRequestView
} from "../repos/contactRequestRepo.js";
import { normalizeEmail } from "../lib/domainAllowlist.js";
import { PersonRepo } from "../repos/personRepo.js";
import type { EmailSender } from "./emailSender.js";

export interface CreateContactRequestInput {
  recipientPersonId: string;
  message: string;
}

export interface RespondContactRequestInput {
  action: "accept" | "decline";
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

    const maxOut = env.CONTACT_REQUEST_MAX_PER_SENDER_WINDOW;
    if (maxOut > 0) {
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
      forwardedToInstitutionalEmail: recipient.institutional_email
    });

    let notificationDelivered = true;
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

    return {
      contactRequest: created,
      notificationDelivered
    };
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
      const sharedContact = normalizeEmail(
        existing.recipientPersonalEmail ?? existing.recipientInstitutionalEmail
      );
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

