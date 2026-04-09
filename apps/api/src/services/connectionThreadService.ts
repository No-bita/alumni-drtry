import type { Pool } from "pg";
import { AppError } from "../lib/errors.js";
import {
  ConnectionThreadRepo,
  type ConnectionDisclosureView,
  type ConnectionMessageView,
  type ConnectionThreadListView,
  type ConnectionThreadRow,
  type DisclosureKind
} from "../repos/connectionThreadRepo.js";
import { LinkRepo } from "../repos/linkRepo.js";
import { PersonRepo } from "../repos/personRepo.js";
import type { EmailSender } from "./emailSender.js";

export const CONNECTION_NUDGE_MESSAGE_THRESHOLD = 4;
export const CONNECTION_MESSAGE_MAX_LENGTH = 300;
export const CONNECTION_MESSAGE_MIN_LENGTH = 1;
export const CONNECTION_THREADS_LIST_LIMIT = 50;
export const CONNECTION_THREAD_RETENTION_DAYS = 7;
export const CONNECTION_THREAD_DELETION_WARNING_DAYS = 5;
export const CONNECTION_REFERRAL_REPLY_PROMPT_THRESHOLD = 3;
export const CONNECTION_REFERRAL_REPLY_CAP = 5;

function isLinkedInPlatform(platform: string): boolean {
  return platform.toLowerCase().includes("linkedin");
}

function assertActivePerson(row: Awaited<ReturnType<PersonRepo["findById"]>>): asserts row is NonNullable<typeof row> {
  if (!row || row.deleted_at || row.suspended_at) {
    throw new AppError(404, "CONNECTION_THREAD_PERSON_NOT_FOUND", "Person not found.");
  }
}

export type DiscloseItemInput =
  | { kind: "institutional_email" }
  | { kind: "personal_email" }
  | { kind: "profile_link"; profileLinkId: string };

export type AvailableDisclosureOption =
  | { kind: "institutional_email"; label: string }
  | { kind: "personal_email"; label: string }
  | { kind: "profile_link"; profileLinkId: string; label: string };

export interface ConnectionThreadDetailView {
  thread: {
    id: string;
    initiatorPersonId: string;
    recipientPersonId: string;
    status: ConnectionThreadRow["status"];
    createdAt: string;
    updatedAt: string;
  };
  /** The other participant (for titles / labels). */
  counterpartyPersonId: string;
  counterpartyFullName: string | null;
  messages: { id: string; authorPersonId: string; body: string; createdAt: string }[];
  disclosures: {
    id: string;
    personId: string;
    kind: DisclosureKind;
    profileLinkId: string | null;
    disclosedValue: string;
    createdAt: string;
  }[];
  messageCount: number;
  showShareNudge: boolean;
  showOfflineContactPrompt: boolean;
  messagesDeletionWarning: string | null;
  referralReplyCount: number;
  availableDisclosures: AvailableDisclosureOption[];
  kind: "general" | "referral";
}

export class ConnectionThreadService {
  private readonly threadRepo: ConnectionThreadRepo;
  private readonly personRepo: PersonRepo;
  private readonly linkRepo: LinkRepo;

  constructor(
    private readonly pool: Pool,
    private readonly emailSender: EmailSender
  ) {
    this.threadRepo = new ConnectionThreadRepo(pool);
    this.personRepo = new PersonRepo(pool);
    this.linkRepo = new LinkRepo(pool);
  }

  private normalizeMessage(body: string): string {
    const t = body.trim();
    if (t.length < CONNECTION_MESSAGE_MIN_LENGTH) {
      throw new AppError(400, "CONNECTION_MESSAGE_EMPTY", "Message cannot be empty.");
    }
    if (t.length > CONNECTION_MESSAGE_MAX_LENGTH) {
      throw new AppError(400, "CONNECTION_MESSAGE_TOO_LONG", "Message is too long.");
    }
    return t;
  }

  private async assertParticipant(threadId: string, personId: string): Promise<ConnectionThreadRow> {
    const row = await this.threadRepo.assertParticipant(threadId, personId);
    if (!row) {
      throw new AppError(404, "CONNECTION_THREAD_NOT_FOUND", "Conversation not found.");
    }
    return row;
  }

  private computeShowNudge(messageCount: number, viewerHasDisclosure: boolean, dismissedAfter: number | null): boolean {
    if (messageCount < CONNECTION_NUDGE_MESSAGE_THRESHOLD || viewerHasDisclosure) return false;
    if (dismissedAfter === null) return true;
    return messageCount > dismissedAfter;
  }

  private async runMessageRetentionSweep(): Promise<void> {
    await this.threadRepo.purgeExpiredMessages(CONNECTION_THREAD_RETENTION_DAYS);
  }

  private computeDeletionWarning(messages: ConnectionMessageView[]): string | null {
    if (messages.length === 0) return null;
    const now = Date.now();
    const thresholdMs = CONNECTION_THREAD_DELETION_WARNING_DAYS * 24 * 60 * 60 * 1000;
    const hasFiveDayOldMessage = messages.some((m) => now - m.createdAt.getTime() >= thresholdMs);
    if (!hasFiveDayOldMessage) return null;
    return "Messages will be deleted in 2 days.";
  }

  private async buildAvailableDisclosures(
    threadId: string,
    personId: string,
    person: NonNullable<Awaited<ReturnType<PersonRepo["findById"]>>>
  ): Promise<AvailableDisclosureOption[]> {
    const existing = await this.threadRepo.listDisclosures(threadId);
    const mine = existing.filter((d) => d.personId === personId);
    const hasKind = (k: DisclosureKind, linkId: string | null = null) =>
      mine.some((d) => d.kind === k && (k !== "profile_link" || d.profileLinkId === linkId));

    const out: AvailableDisclosureOption[] = [];
    if (!hasKind("institutional_email")) {
      out.push({ kind: "institutional_email", label: "Institutional email" });
    }
    if (person.personal_email?.trim() && !hasKind("personal_email")) {
      out.push({ kind: "personal_email", label: "Personal email" });
    }
    const links = await this.linkRepo.listByPerson(personId);
    for (const link of links) {
      if (!isLinkedInPlatform(link.platform)) continue;
      if (hasKind("profile_link", link.id)) continue;
      out.push({
        kind: "profile_link",
        profileLinkId: link.id,
        label: link.platform.trim() || "LinkedIn"
      });
    }
    return out;
  }

  async createOrContinueThread(
    initiatorId: string,
    recipientPersonId: string,
    initialMessage: string,
    kind: "general" | "referral" = "general"
  ): Promise<{ threadId: string; reusedThread: boolean }> {
    await this.runMessageRetentionSweep();
    if (initiatorId === recipientPersonId) {
      throw new AppError(400, "CONNECTION_THREAD_SELF", "You cannot message yourself.");
    }

    const initiator = await this.personRepo.findById(initiatorId);
    assertActivePerson(initiator);
    const recipient = await this.personRepo.findById(recipientPersonId);
    assertActivePerson(recipient);

    const body = this.normalizeMessage(initialMessage);

    const existing = await this.threadRepo.findOpenThreadBetween(initiatorId, recipientPersonId);
    if (existing) {
      await this.threadRepo.addMessage(existing.id, initiatorId, body);
      return { threadId: existing.id, reusedThread: true };
    }

    const { thread } = await this.threadRepo.createThreadWithFirstMessage(initiatorId, recipientPersonId, body, kind);

    try {
      await this.emailSender.sendContactRequestReceivedEmail({
        to: recipient.institutional_email,
        recipientName: recipient.full_name ?? "there",
        senderName: initiator.full_name ?? initiator.institutional_email,
        message: body
      });
    } catch (err) {
      console.error("[connection-thread] notify recipient email failed (thread still created):", err);
    }

    return { threadId: thread.id, reusedThread: false };
  }

  async listThreadsForPerson(personId: string): Promise<ConnectionThreadListView[]> {
    await this.runMessageRetentionSweep();
    return this.threadRepo.listThreadsForPerson(personId, CONNECTION_THREADS_LIST_LIMIT);
  }

  async getThreadDetail(personId: string, threadId: string): Promise<ConnectionThreadDetailView> {
    await this.runMessageRetentionSweep();
    const thread = await this.assertParticipant(threadId, personId);
    const [messages, disclosures, messageCount, person, dismissed, counterparty, referralReplyCount] = await Promise.all([
      this.threadRepo.listMessages(threadId),
      this.threadRepo.listDisclosures(threadId),
      this.threadRepo.countMessages(threadId),
      this.personRepo.findById(personId),
      this.threadRepo.getNudgeDismissal(threadId, personId),
      this.personRepo.findById(
        thread.initiator_person_id === personId ? thread.recipient_person_id : thread.initiator_person_id
      ),
      this.threadRepo.countMessagesByAuthor(threadId, thread.recipient_person_id)
    ]);
    assertActivePerson(person);
    assertActivePerson(counterparty);

    const viewerHasDisclosure = await this.threadRepo.hasDisclosureFromPerson(threadId, personId);
    const showShareNudge = this.computeShowNudge(messageCount, viewerHasDisclosure, dismissed);
    const isReferralThread = thread.kind === "referral";
    const showOfflineContactPrompt =
      isReferralThread &&
      personId === thread.recipient_person_id &&
      referralReplyCount >= CONNECTION_REFERRAL_REPLY_PROMPT_THRESHOLD &&
      thread.status === "open";
    const messagesDeletionWarning = this.computeDeletionWarning(messages);
    const availableDisclosures = await this.buildAvailableDisclosures(threadId, personId, person);

    return {
      thread: {
        id: thread.id,
        initiatorPersonId: thread.initiator_person_id,
        recipientPersonId: thread.recipient_person_id,
        status: thread.status,
        createdAt: thread.created_at.toISOString(),
        updatedAt: thread.updated_at.toISOString()
      },
      counterpartyPersonId: counterparty.id,
      counterpartyFullName: counterparty.full_name,
      messages: messages.map((m) => ({
        id: m.id,
        authorPersonId: m.authorPersonId,
        body: m.body,
        createdAt: m.createdAt.toISOString()
      })),
      disclosures: disclosures.map((d) => ({
        id: d.id,
        personId: d.personId,
        kind: d.kind,
        profileLinkId: d.profileLinkId,
        disclosedValue: d.disclosedValue,
        createdAt: d.createdAt.toISOString()
      })),
      messageCount,
      showShareNudge,
      showOfflineContactPrompt,
      messagesDeletionWarning,
      referralReplyCount,
      availableDisclosures,
      kind: thread.kind
    };
  }

  async addMessage(personId: string, threadId: string, body: string): Promise<ConnectionMessageView> {
    await this.runMessageRetentionSweep();
    const thread = await this.assertParticipant(threadId, personId);
    if (thread.status !== "open") {
      throw new AppError(409, "CONNECTION_THREAD_CLOSED", "This conversation is closed.");
    }
    if (thread.kind === "referral") {
      const referralReplyCount = await this.threadRepo.countMessagesByAuthor(threadId, thread.recipient_person_id);
      if (referralReplyCount >= CONNECTION_REFERRAL_REPLY_CAP) {
        await this.threadRepo.setThreadStatus(threadId, "closed");
        throw new AppError(
          409,
          "CONNECTION_THREAD_REFERRAL_REPLY_CAP_REACHED",
          "This referral conversation reached the 5-reply limit and is now closed."
        );
      }
    }
    const text = this.normalizeMessage(body);
    const message = await this.threadRepo.addMessage(threadId, personId, text);
    if (thread.kind === "referral" && personId === thread.recipient_person_id) {
      const updatedReferralReplyCount = await this.threadRepo.countMessagesByAuthor(threadId, thread.recipient_person_id);
      if (updatedReferralReplyCount >= CONNECTION_REFERRAL_REPLY_CAP) {
        await this.threadRepo.setThreadStatus(threadId, "closed");
      }
    }
    return message;
  }

  async dismissNudge(personId: string, threadId: string): Promise<void> {
    await this.assertParticipant(threadId, personId);
    const count = await this.threadRepo.countMessages(threadId);
    await this.threadRepo.upsertNudgeDismissal(threadId, personId, count);
  }

  async disclose(personId: string, threadId: string, items: DiscloseItemInput[]): Promise<ConnectionDisclosureView[]> {
    const thread = await this.assertParticipant(threadId, personId);
    if (thread.status !== "open") {
      throw new AppError(409, "CONNECTION_THREAD_CLOSED", "This conversation is closed.");
    }
    if (items.length === 0) {
      throw new AppError(400, "CONNECTION_DISCLOSE_EMPTY", "Choose at least one item to share.");
    }

    const person = await this.personRepo.findById(personId);
    assertActivePerson(person);

    const created: ConnectionDisclosureView[] = [];
    for (const item of items) {
      if (item.kind === "institutional_email") {
        const row = await this.threadRepo.insertDisclosure({
          threadId,
          personId,
          kind: "institutional_email",
          profileLinkId: null,
          disclosedValue: person.institutional_email
        });
        created.push(row);
      } else if (item.kind === "personal_email") {
        const pe = person.personal_email?.trim();
        if (!pe) {
          throw new AppError(400, "CONNECTION_DISCLOSE_NO_PERSONAL_EMAIL", "You have no personal email on file.");
        }
        const row = await this.threadRepo.insertDisclosure({
          threadId,
          personId,
          kind: "personal_email",
          profileLinkId: null,
          disclosedValue: pe
        });
        created.push(row);
      } else {
        const link = await this.linkRepo.findByIdAndPerson(item.profileLinkId, personId);
        if (!link || !isLinkedInPlatform(link.platform)) {
          throw new AppError(400, "CONNECTION_DISCLOSE_BAD_LINK", "Invalid LinkedIn link selection.");
        }
        const row = await this.threadRepo.insertDisclosure({
          threadId,
          personId,
          kind: "profile_link",
          profileLinkId: link.id,
          disclosedValue: link.url
        });
        created.push(row);
      }
    }

    return created;
  }

  async closeThread(personId: string, threadId: string, status: "closed" | "declined"): Promise<void> {
    await this.assertParticipant(threadId, personId);
    const t = await this.threadRepo.findById(threadId);
    if (!t || t.status !== "open") {
      throw new AppError(409, "CONNECTION_THREAD_ALREADY_CLOSED", "Conversation is already closed.");
    }
    await this.threadRepo.setThreadStatus(threadId, status);
  }
}
