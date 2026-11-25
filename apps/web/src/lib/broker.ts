import { api } from "../api/client";
import type { NoteDetails } from "./noteForm";
import { assertApiGet } from "./assertApiGet";
import type { ExperienceBand, JobFunction } from "./jobFunctions";

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
  connection: { personId: string; fullName: string | null; contactShared: string | null } | null;
};

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
  askerContact: string | null;
};

export const brokerKeys = {
  all: ["broker"] as const,
  requests: () => ["broker", "requests"] as const,
  asks: () => ["broker", "asks"] as const,
  companies: () => ["broker", "referral-companies"] as const,
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
