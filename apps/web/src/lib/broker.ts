import { api } from "../api/client";
import type { NoteDetails } from "./noteForm";
import { assertApiGet } from "./assertApiGet";
import { EXPERIENCE_BAND_LABELS, JOB_FUNCTION_LABELS, type ExperienceBand, type JobFunction } from "./jobFunctions";

/**
 * Brokered requests: say what you need once; Alma Mater asks every eligible alum on your behalf and
 * connects you with the first who says yes. Referrals always work this way; hiring posts can opt in.
 */
export type BrokerKind = "referral" | "hiring";

/** GET /v1/broker-requests: the viewer's own requests (never who was asked). */
export type BrokerRequest = {
  id: string;
  kind: BrokerKind;
  company: string;
  jobFunction: JobFunction;
  experienceBand: ExperienceBand | null;
  roleTitle: string | null;
  jobUrl: string | null;
  status: "open" | "connected" | "expired";
  askedCount: number;
  seenCount: number;
  createdAt: string;
  expiresAt: string;
  firstSeenAt: string | null;
  connectedAt: string | null;
  expiredAt: string | null;
  intentcastId: string | null;
  /** Who said yes: name and profile only. No contact is shared; you talk in the conversation. */
  connection: { personId: string; fullName: string | null } | null;
  /** Once connected: the way into your conversation with them. */
  conversation: BrokerConversationSummary | null;
};

/** Why a conversation takes no new messages. */
export type BrokerReadOnlyReason = "closed_by_you" | "closed_by_them" | "inactive" | "limit" | "unavailable";

/** On list cards: is the conversation open, and how many messages you haven't read. */
export type BrokerConversationSummary = {
  state: "open" | "read_only";
  readOnlyReason: BrokerReadOnlyReason | null;
  unreadCount: number;
  messageCount: number;
  lastMessageAt: string | null;
};

/** GET /v1/broker-requests/:id/conversation: the asker and the helper who said yes, nobody else. */
export type BrokerConversation = BrokerConversationSummary & {
  requestId: string;
  role: "asker" | "helper";
  counterpart: { personId: string; fullName: string | null; departmentCode: string | null; batchYear: number | null };
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
  readOnlyAt: string | null;
  canSend: boolean;
  limits: { maxChars: number; maxUnanswered: number; inactiveDays: number; maxMessages: number };
  messages: BrokerMessage[];
};

export type BrokerMessage = { id: string; mine: boolean; body: string; createdAt: string };

/** GET /v1/broker-asks: asks waiting for the viewer, and the ones they said yes to. */
export type BrokerAsk = {
  askId: string;
  requestId: string;
  kind: BrokerKind;
  status: "asked" | "accepted" | "declined" | "withdrawn";
  requestStatus: "open" | "connected" | "expired";
  askedAt: string;
  expiresAt: string;
  seenAt: string | null;
  company: string;
  jobFunction: JobFunction;
  experienceBand: ExperienceBand | null;
  roleTitle: string | null;
  jobUrl: string | null;
  message: string;
  details: NoteDetails | null;
  asker: { personId: string; fullName: string | null; institutionName: string | null; batchYear: number | null; departmentCode: string | null };
  /** Once you said yes: the way into your conversation with the asker. */
  conversation: BrokerConversationSummary | null;
};

export const brokerKeys = {
  all: ["broker"] as const,
  requests: () => ["broker", "requests"] as const,
  asks: () => ["broker", "asks"] as const,
  companies: () => ["broker", "referral-companies"] as const,
  conversation: (requestId: string) => ["broker", "conversation", requestId] as const,
};

export async function fetchBrokerRequests(signal: AbortSignal): Promise<BrokerRequest[]> {
  return (await assertApiGet<{ requests: BrokerRequest[] }>("/v1/broker-requests", signal)).requests;
}

export async function fetchBrokerAsks(signal: AbortSignal): Promise<BrokerAsk[]> {
  return (await assertApiGet<{ asks: BrokerAsk[] }>("/v1/broker-asks", signal)).asks;
}

export async function fetchReferralCompaniesAll(signal: AbortSignal): Promise<Array<{ company: string; alumni: number }>> {
  return (await assertApiGet<{ companies: Array<{ company: string; alumni: number }> }>("/v1/broker-requests/referral-companies", signal)).companies;
}

export function referralEligible(company: string, signal?: AbortSignal) {
  return api.get<{ company: string; count: number }>(`/v1/broker-requests/referral-eligible?company=${encodeURIComponent(company.trim())}`, { signal });
}

export function hiringEligible(jobFunction: JobFunction, experience: ExperienceBand, signal?: AbortSignal) {
  return api.get<{ count: number }>(`/v1/broker-requests/hiring-eligible?jobFunction=${jobFunction}&experience=${experience}`, { signal });
}

export async function fetchBrokerConversation(requestId: string, signal: AbortSignal): Promise<BrokerConversation> {
  return (await assertApiGet<{ conversation: BrokerConversation }>(`/v1/broker-requests/${requestId}/conversation`, signal)).conversation;
}

export function sendBrokerMessage(requestId: string, body: string) {
  return api.post<{ message: BrokerMessage }>(`/v1/broker-requests/${requestId}/conversation/messages`, { body });
}

export function markBrokerConversationRead(requestId: string) {
  return api.post(`/v1/broker-requests/${requestId}/conversation/read`, {});
}

export function closeBrokerConversation(requestId: string) {
  return api.post(`/v1/broker-requests/${requestId}/conversation/close`, {});
}

/** Where the conversation for a connected request lives. */
export function conversationPath(requestId: string): string {
  return `/requests/${requestId}/conversation`;
}

/** Refresh while the conversation is open (new messages arrive without a reload). */
export const BROKER_CONVERSATION_POLL_MS = 15_000;

/** Why it's read-only, in the broker UI's wording. */
export function readOnlyLabel(reason: BrokerReadOnlyReason, name: string, inactiveDays: number): string {
  switch (reason) {
    case "closed_by_you":
      return "You closed this conversation. You can still read it.";
    case "closed_by_them":
      return `${name} closed this conversation. You can still read it.`;
    case "inactive":
      return `This conversation went quiet for ${inactiveDays} days, so it's read-only now.`;
    case "limit":
      return "This conversation reached its message limit, so it's read-only now.";
    case "unavailable":
      return `${name} is no longer on Alma Mater.`;
  }
}

/** "Message Vikram" / "2 new messages" on a card. */
export function conversationLinkLabel(c: BrokerConversationSummary, firstName: string): string {
  if (c.unreadCount > 0) return c.unreadCount === 1 ? "1 new message" : `${c.unreadCount} new messages`;
  if (c.state === "read_only" || c.messageCount > 0) return "Open conversation";
  return `Message ${firstName}`;
}

/** "Referral · Swiggy · Product Manager" / "Hiring · Product role · 3–7 yrs". */
export function brokerRequestTitle(r: Pick<BrokerRequest, "kind" | "company" | "roleTitle" | "jobFunction" | "experienceBand">): string {
  if (r.kind === "referral") return ["Referral", r.company, r.roleTitle].filter(Boolean).join(" · ");
  return ["Hiring", r.roleTitle || `${JOB_FUNCTION_LABELS[r.jobFunction]} role`, r.experienceBand ? EXPERIENCE_BAND_LABELS[r.experienceBand] : null]
    .filter(Boolean)
    .join(" · ");
}

/** "6 alumni" / "1 alum". */
export function alumniCount(n: number): string {
  return n === 1 ? "1 alum" : `${n} alumni`;
}

export type ProgressStage = { key: "received" | "sent" | "seen" | "result"; label: string; state: "done" | "current" | "todo" | "closed" };

/**
 * The asker's timeline, like a ride booking: Request received → Sent to N alumni at X → K have seen it
 * → Connected (or Closed: no one was available). Updated on each visit, not in real time.
 */
export function progressStages(r: BrokerRequest): ProgressStage[] {
  const where = r.kind === "referral" ? `at ${r.company}` : "who match your role";
  const seen = r.seenCount > 0;
  const result: ProgressStage =
    r.status === "connected"
      ? { key: "result", label: `${r.connection?.fullName?.trim() || "An alum"} said yes. You're connected`, state: "done" }
      : r.status === "expired"
        ? { key: "result", label: "Closed: no one was available this time", state: "closed" }
        : { key: "result", label: "Someone says yes, and we connect you", state: "todo" };
  return [
    { key: "received", label: "Request received", state: "done" },
    { key: "sent", label: `Sent to ${alumniCount(r.askedCount)} ${where}`, state: "done" },
    {
      key: "seen",
      label: seen ? `${r.seenCount} ${r.seenCount === 1 ? "has" : "have"} seen it` : "Waiting for someone to see it",
      state: seen ? "done" : r.status === "open" ? "current" : "todo",
    },
    r.status === "open" && seen ? { ...result, state: "current" } : result,
  ];
}

/** "Closes in 1 day" / "Closes in 5 hours" while open. */
export function closesInLabel(expiresAt: string, now: number = Date.now()): string {
  const hours = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 3_600_000));
  if (hours >= 24) {
    const days = Math.round(hours / 24);
    return `Closes in ${days} ${days === 1 ? "day" : "days"}`;
  }
  return hours <= 1 ? "Closes within the hour" : `Closes in ${hours} hours`;
}
