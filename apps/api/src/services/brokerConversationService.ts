import type { Pool, PoolClient } from "pg";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import type { ExperienceBand, JobFunction } from "../lib/jobFunctions.js";
import type { NoteDetails } from "../lib/noteDetails.js";
import { webAppUrl } from "../lib/webAppUrl.js";
import type { BrokerKind } from "../repos/brokerRepo.js";
import {
  BrokerConversationRepo,
  type BrokerConversationSummaryRow,
  type BrokerMessageNotificationRow,
  type BrokerThreadRow
} from "../repos/brokerConversationRepo.js";
import type { EmailSender } from "./emailSender.js";

/*
 * Limited messaging for brokered requests. Once a helper says yes, the asker and that helper get one
 * private conversation tied to the request; no one's contact is shared by the platform. "Limited":
 * only those two can read or write; text only; short messages; a per-sender rate limit; no more than a
 * few messages in a row without a reply; either person can close it; it goes read-only after a quiet
 * spell or a total number of messages. Links are kept as typed (the app makes them clickable, with no
 * previews). Anyone can choose to type their own contact; the platform never adds it.
 * Every limit is a named constant here so it can be tuned in one place.
 */

/** Longest message, in characters (after trimming). */
export const BROKER_MESSAGE_MAX_CHARS = 1000;
/** Rate limit: at most this many messages per sender, across all their brokered conversations ... */
export const BROKER_MESSAGES_PER_WINDOW = 10;
/** ... in this many minutes. */
export const BROKER_MESSAGE_RATE_WINDOW_MINUTES = 10;
/** Messages one person can send in a row before the other replies (stops one-sided chasing). */
export const BROKER_MESSAGE_MAX_UNANSWERED = 5;
/** Read-only after this many days with no new message (counted from the yes when nobody has written). */
export const BROKER_CONVERSATION_INACTIVE_DAYS = 14;
/** Read-only once the conversation holds this many messages: enough to arrange a referral or a call. */
export const BROKER_CONVERSATION_MAX_MESSAGES = 200;

/** Control characters other than tab and newline (text only: nothing that could smuggle formatting). */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export type ReadOnlyReason = "closed_by_you" | "closed_by_them" | "inactive" | "limit" | "unavailable";

export interface BrokerConversationSummary {
  state: "open" | "read_only";
  readOnlyReason: ReadOnlyReason | null;
  unreadCount: number;
  messageCount: number;
  lastMessageAt: string | null;
}

export interface BrokerConversationView extends BrokerConversationSummary {
  requestId: string;
  /** Which side of the request the viewer is on. */
  role: "asker" | "helper";
  /** The other person: name, department and year for the header and a profile link. No contact. */
  counterpart: { personId: string; fullName: string | null; departmentCode: string | null; batchYear: number | null };
  /** The request the conversation is about. */
  request: {
    kind: BrokerKind;
    company: string;
    jobFunction: JobFunction;
    experienceBand: ExperienceBand | null;
    roleTitle: string | null;
    jobUrl: string | null;
    message: string;
    details: NoteDetails | null;
  };
  /** When it goes read-only for inactivity, if nobody writes before then (null once read-only). */
  readOnlyAt: string | null;
  canSend: boolean;
  limits: { maxChars: number; maxUnanswered: number; inactiveDays: number; maxMessages: number };
  messages: Array<{ id: string; mine: boolean; body: string; createdAt: string }>;
}

export interface BrokerMessageDto {
  id: string;
  mine: true;
  body: string;
  createdAt: string;
}

function lastActivity(t: Pick<BrokerThreadRow, "created_at" | "last_message_at">): Date {
  return t.last_message_at && t.last_message_at > t.created_at ? t.last_message_at : t.created_at;
}

/** Why the conversation can't take new messages, or null while it can. Order: closed, person gone, quiet, full. */
export function readOnlyReason(
  t: Pick<BrokerThreadRow, "status" | "closed_by_person_id" | "created_at" | "last_message_at" | "message_count">,
  viewerPersonId: string,
  counterpartUnavailable: boolean,
  now: number = Date.now()
): ReadOnlyReason | null {
  if (t.status !== "open") return t.closed_by_person_id === viewerPersonId ? "closed_by_you" : "closed_by_them";
  if (counterpartUnavailable) return "unavailable";
  if (now - lastActivity(t).getTime() >= BROKER_CONVERSATION_INACTIVE_DAYS * 86_400_000) return "inactive";
  if (Number(t.message_count) >= BROKER_CONVERSATION_MAX_MESSAGES) return "limit";
  return null;
}

/** Trims, strips control characters and line-ending noise; rejects empty and over-long text. */
export function normalizeBrokerMessage(body: unknown): string {
  if (typeof body !== "string") throw new AppError(400, "BROKER_MESSAGE_EMPTY", "Write a message first.");
  const text = body.replace(/\r\n?/g, "\n").replace(CONTROL_CHARS, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new AppError(400, "BROKER_MESSAGE_EMPTY", "Write a message first.");
  if (text.length > BROKER_MESSAGE_MAX_CHARS) {
    throw new AppError(400, "BROKER_MESSAGE_TOO_LONG", `Keep it under ${BROKER_MESSAGE_MAX_CHARS} characters.`);
  }
  return text;
}

const READ_ONLY_MESSAGES: Record<ReadOnlyReason, string> = {
  closed_by_you: "You closed this conversation.",
  closed_by_them: "This conversation was closed.",
  inactive: `This conversation is read-only after ${BROKER_CONVERSATION_INACTIVE_DAYS} quiet days.`,
  limit: `This conversation reached its ${BROKER_CONVERSATION_MAX_MESSAGES}-message limit.`,
  unavailable: "This member is no longer on Alma Mater."
};

function firstName(full: string | null | undefined): string {
  return (full ?? "").trim().split(/\s+/)[0] || "there";
}

export class BrokerConversationService {
  private readonly repo: BrokerConversationRepo;

  constructor(
    private readonly pool: Pool,
    private readonly emailSender: EmailSender
  ) {
    this.repo = new BrokerConversationRepo(pool);
  }

  /** The thread when the viewer is the asker or the helper who said yes; 404 for anyone else. */
  private async threadFor(repo: BrokerConversationRepo, requestId: string, personId: string, lock = false): Promise<BrokerThreadRow> {
    const t = await repo.forParticipant(requestId, personId, lock);
    if (!t) throw new AppError(404, "BROKER_CONVERSATION_NOT_FOUND", "Conversation not found.");
    return t;
  }

  async get(viewerPersonId: string, requestId: string): Promise<BrokerConversationView> {
    const t = await this.threadFor(this.repo, requestId, viewerPersonId);
    const counterpartId = t.initiator_person_id === viewerPersonId ? t.recipient_person_id : t.initiator_person_id;
    const [context, counterpart, messages, unread] = await Promise.all([
      this.repo.context(requestId),
      this.repo.participant(counterpartId),
      this.repo.messages(t.id),
      this.repo.unreadFor(t.id, viewerPersonId)
    ]);
    if (!context || !counterpart) throw new AppError(404, "BROKER_CONVERSATION_NOT_FOUND", "Conversation not found.");
    const reason = readOnlyReason(t, viewerPersonId, counterpart.unavailable);
    return {
      requestId,
      role: t.initiator_person_id === viewerPersonId ? "asker" : "helper",
      counterpart: {
        personId: counterpart.personId,
        fullName: counterpart.fullName,
        departmentCode: counterpart.departmentCode,
        batchYear: counterpart.batchYear
      },
      request: context,
      state: reason ? "read_only" : "open",
      readOnlyReason: reason,
      readOnlyAt: reason ? null : new Date(lastActivity(t).getTime() + BROKER_CONVERSATION_INACTIVE_DAYS * 86_400_000).toISOString(),
      canSend: reason === null,
      unreadCount: unread,
      messageCount: Number(t.message_count),
      lastMessageAt: t.last_message_at ? t.last_message_at.toISOString() : null,
      limits: {
        maxChars: BROKER_MESSAGE_MAX_CHARS,
        maxUnanswered: BROKER_MESSAGE_MAX_UNANSWERED,
        inactiveDays: BROKER_CONVERSATION_INACTIVE_DAYS,
        maxMessages: BROKER_CONVERSATION_MAX_MESSAGES
      },
      messages: messages.map((m) => ({ id: m.id, mine: m.authorPersonId === viewerPersonId, body: m.body, createdAt: m.createdAt.toISOString() }))
    };
  }

  async send(viewerPersonId: string, requestId: string, rawBody: unknown): Promise<BrokerMessageDto> {
    const body = normalizeBrokerMessage(rawBody);
    const out = await this.inTransaction(async (repo) => {
      // Locked, so a close and a send can't cross and the in-a-row count is exact.
      const t = await this.threadFor(repo, requestId, viewerPersonId, true);
      const counterpartId = t.initiator_person_id === viewerPersonId ? t.recipient_person_id : t.initiator_person_id;
      const counterpart = await repo.participant(counterpartId);
      const reason = readOnlyReason(t, viewerPersonId, counterpart?.unavailable ?? true);
      if (reason) throw new AppError(409, "BROKER_CONVERSATION_READ_ONLY", READ_ONLY_MESSAGES[reason]);

      const recent = await repo.latestAuthors(t.id, BROKER_MESSAGE_MAX_UNANSWERED);
      if (recent.length >= BROKER_MESSAGE_MAX_UNANSWERED && recent.every((a) => a === viewerPersonId)) {
        throw new AppError(
          429,
          "BROKER_MESSAGE_WAIT_FOR_REPLY",
          `You've sent ${BROKER_MESSAGE_MAX_UNANSWERED} messages in a row. Wait for ${firstName(counterpart?.fullName)} to reply.`
        );
      }

      const windowMs = BROKER_MESSAGE_RATE_WINDOW_MINUTES * 60_000;
      const sent = await repo.sentSince(viewerPersonId, new Date(Date.now() - windowMs));
      if (sent.count >= BROKER_MESSAGES_PER_WINDOW) {
        const retryAfter = sent.oldest ? Math.max(1, Math.ceil((sent.oldest.getTime() + windowMs - Date.now()) / 1000)) : 60;
        throw new AppError(429, "BROKER_MESSAGE_RATE_LIMITED", "You're sending messages quickly. Try again in a few minutes.", true, retryAfter);
      }

      // Email only when this is the first unread message for them (one nudge, not one per message).
      const hadUnread = (await repo.unreadFor(t.id, counterpartId)) > 0;
      const message = await repo.addMessage(t.id, viewerPersonId, body);
      await repo.markRead(t.id, viewerPersonId);
      return { message, counterpart, hadUnread, role: t.initiator_person_id === viewerPersonId ? ("asker" as const) : ("helper" as const) };
    });

    if (!out.hadUnread && out.counterpart && env.BROKER_EMAILS_ENABLED) {
      const sender = await this.repo.participant(viewerPersonId);
      const context = await this.repo.context(requestId);
      const name = sender?.fullName?.trim() || "An alum";
      try {
        await this.emailSender.sendBrokerEmail({
          to: out.counterpart.email,
          event: "message_received",
          subject: `${name} sent you a message`,
          greetingName: firstName(out.counterpart.fullName),
          paragraphs: [
            context?.kind === "referral"
              ? `${name} sent you a message about the referral at ${context.company}.`
              : `${name} sent you a message about the hiring request${context ? ` (${context.company})` : ""}.`,
            "Read and reply on Alma Mater."
          ],
          ctaLabel: "Open the conversation",
          ctaUrl: `${webAppUrl()}/requests/${requestId}/conversation`
        });
      } catch (err) {
        console.error("[broker] message_received email failed (the app still shows it):", err);
      }
    }

    return { id: out.message.id, mine: true, body: out.message.body, createdAt: out.message.createdAt.toISOString() };
  }

  async markRead(viewerPersonId: string, requestId: string): Promise<void> {
    const t = await this.threadFor(this.repo, requestId, viewerPersonId);
    await this.repo.markRead(t.id, viewerPersonId);
  }

  /** Either person can close (leave) the conversation; it stays readable, and no one can write again. */
  async close(viewerPersonId: string, requestId: string): Promise<void> {
    const t = await this.threadFor(this.repo, requestId, viewerPersonId);
    if (t.status !== "open") throw new AppError(409, "BROKER_CONVERSATION_CLOSED", "This conversation is already closed.");
    if (!(await this.repo.close(t.id, viewerPersonId))) {
      throw new AppError(409, "BROKER_CONVERSATION_CLOSED", "This conversation is already closed.");
    }
  }

  /** The viewer's conversations for these requests (lists show a way in and unread counts). */
  async summaries(viewerPersonId: string, requestIds: string[]): Promise<Map<string, BrokerConversationSummary>> {
    const rows = await this.repo.summaries(viewerPersonId, requestIds);
    const out = new Map<string, BrokerConversationSummary>();
    for (const [id, row] of rows) out.set(id, this.summary(row, viewerPersonId));
    return out;
  }

  private summary(row: BrokerConversationSummaryRow, viewerPersonId: string): BrokerConversationSummary {
    const reason = readOnlyReason(
      {
        status: row.status,
        closed_by_person_id: row.closedByPersonId,
        created_at: row.createdAt,
        last_message_at: row.lastMessageAt,
        message_count: row.messageCount
      },
      viewerPersonId,
      row.counterpartUnavailable
    );
    return {
      state: reason ? "read_only" : "open",
      readOnlyReason: reason,
      unreadCount: row.unreadCount,
      messageCount: row.messageCount,
      lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null
    };
  }

  async messageNotifications(personId: string, limit: number): Promise<BrokerMessageNotificationRow[]> {
    return this.repo.messageNotifications(personId, limit);
  }

  async countMessageNotifications(personId: string): Promise<number> {
    return this.repo.countMessageNotifications(personId);
  }

  private async inTransaction<T>(work: (repo: BrokerConversationRepo, client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const out = await work(new BrokerConversationRepo(client), client);
      await client.query("COMMIT");
      return out;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
