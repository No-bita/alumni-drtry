import { assertApiGet } from "./assertApiGet";

/*
 * GET /v1/admin/analytics — the admin analytics screen's data.
 * Types mirror apps/api/src/repos/analyticsRepo.ts (keep both in sync).
 */
export interface WeeklyPoint {
  /** Monday of the week (ISO date). */
  weekStart: string;
  value: number;
}

export interface DemandRow {
  category: string | null;
  company: string | null;
  role: string | null;
  city: string | null;
  country: string | null;
  questions: number;
  zeroResults: number;
  /** Alumni matching everything the question named (company/role/city/country). */
  supply: number;
  /** Of those, how many picked a help topic that fits the kind of help asked for. */
  supplyOffering: number;
}

export interface AnalyticsReport {
  windowDays: number;
  generatedAt: string;
  northStar: {
    acceptedNotes: number;
    askers: number;
    helpedWithin7Days: number;
    /** Askers whose first note is under 7 days old and not yet accepted: may still be helped. */
    stillWithin7Days: number;
    trendAccepted: WeeklyPoint[];
    trendSent: WeeklyPoint[];
  };
  signIn: {
    starts: number;
    completed: number;
    emailSent: number;
    emailUnconfirmed: number;
    /** Attempts from before delivery was recorded (migration 050). */
    emailUnknown: number;
    failedRejected: number;
    failedUnreachable: number;
    superseded: number;
    sessionsByMethod: Record<string, number>;
    newMembers: number;
    trendNewMembers: WeeklyPoint[];
  };
  onboarding: {
    startedPeople: number;
    completedPeople: number;
    completedOnboardingProfiles: number;
    validationErrors: number;
    steps: Array<{ stage: string; questionId: string; questionIndex: number; people: number }>;
    profiles: { members: number; completed: number; withCurrentRole: number; withPastRole: number; withOpenTo: number };
  };
  asking: {
    questions: number;
    needsDetail: number;
    zeroResults: number;
    withMatches: number;
    byCategory: Array<{ category: string | null; questions: number; needsDetail: number; zeroResults: number }>;
    trendQuestions: WeeklyPoint[];
    search: { searches: number; zeroResults: number; filtersChanged: number; loadMore: number };
  };
  demandSupply: {
    byCategory: Array<{ category: string; questions: number; alumniOffering: number }>;
    top: DemandRow[];
  };
  matching: {
    questionsWithMatches: number;
    notesFromMatch: number;
    byRank: Array<{ rank: number | null; notes: number; accepted: number; declined: number }>;
    /** Notes sent from Ask -> Match, by the kind of help asked for. */
    byCategory: Array<{ category: string | null; notes: number; accepted: number; declined: number; pending: number }>;
  };
  outcomes: {
    sent: number;
    accepted: number;
    declined: number;
    pending: number;
    medianReplyHours: number | null;
    remindersSent: number;
    repliedAfterReminder: number;
    fairness: {
      recipients: number;
      /** Share of notes (0..1) that went to the most-contacted 10% of recipients. */
      top10Share: number | null;
      /** Alumni with 5+ new notes in the last 7 days (the weekly cap). */
      atWeeklyCap: number;
      /** Alumni with 2+ notes older than 7 days in the window and no reply to any. */
      silentAlumni: number;
    };
  };
  wall: {
    posts: number;
    postsWithReply: number;
    replies: number;
    medianFirstReplyHours: number | null;
    expiredWithoutReply: number;
    trendPosts: WeeklyPoint[];
  };
  engagement: {
    activeMembers: number;
    returningMembers: number;
    trendActive: WeeklyPoint[];
    home: Array<{ event: string; count: number; people: number }>;
    browseByLink: Array<{ link: string; count: number }>;
    notifications: { opened: number; clicked: number };
  };
  growth: {
    inviteOpened: number;
    inviteCopied: number;
    inviteWhatsapp: number;
    invitedSignups: { copy: number; whatsapp: number };
    trendInvitedSignups: WeeklyPoint[];
    byBatch: Array<{ batchYear: number; members: number }>;
    byDepartment: Array<{ code: string; name: string; members: number }>;
  };
  whatsapp: {
    linkedMembers: number;
    notesOptedIn: number;
    notesPaused: number;
    stopped: number;
    /** Distinct numbers that texted the bot in the window, and how many were linked in it. */
    numbersTexting: number;
    linkedInWindow: number;
    notesFromBot: number;
    notesFromBotAccepted: number;
    month: {
      inbound: number;
      serviceReplies: number;
      freeServicePerMonth: number;
      templates: number;
      templateCap: number;
      /** Estimate (₹, incl. GST): templates plus service replies past the free tier. Meta's invoice is final. */
      estimatedSpendRupees: number;
    };
    /** Test 1: notes by how the alum was told. */
    byChannel: Array<{ channel: "email" | "whatsapp"; notes: number; accepted: number; declined: number; medianReplyHours: number | null }>;
    /** Test 2: members who joined in the window, by where they arrived from. */
    onboardingByArrival: Array<{ arrival: "whatsapp" | "website"; started: number; finished: number }>;
  };
  operations: {
    orgsPending: number;
    suspended: number;
    deletedInWindow: number;
    admins: number;
    /** Everyone in the directory (not deleted), split by kind; real members are what every other number counts. */
    directory: { total: number; real: number; demo: number; test: number };
  };
}

export const ANALYTICS_WINDOWS = [7, 30, 90] as const;
export type AnalyticsWindow = (typeof ANALYTICS_WINDOWS)[number];

export const analyticsQueryKey = (days: AnalyticsWindow) => ["admin", "analytics", days] as const;

export async function fetchAnalytics(days: AnalyticsWindow, signal: AbortSignal, fresh = false): Promise<AnalyticsReport> {
  const data = await assertApiGet<{ report: AnalyticsReport }>(
    `/v1/admin/analytics?days=${days}${fresh ? "&fresh=1" : ""}`,
    signal,
  );
  return data.report;
}

/** "42%" or "—" when there is nothing to divide by. */
export function pct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${Math.round((100 * part) / whole)}%`;
}

/** 1,284 · 12.9K · 1.2M */
export function compact(n: number): string {
  if (Math.abs(n) < 10_000) return n.toLocaleString("en-IN");
  if (Math.abs(n) < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** Hours as "5 h" under two days, else "2.5 days"; "—" when unknown. */
export function duration(hours: number | null): string {
  if (hours == null) return "—";
  if (hours < 48) return `${Math.round(hours * 10) / 10} h`;
  return `${Math.round((hours / 24) * 10) / 10} days`;
}

/* ---------------- WhatsApp pilot: the two go / no-go tests ---------------- */

export const WA_MIN_NOTES = 30;

export type Verdict = { status: "not_enough_data" | "passes" | "not_yet"; detail: string };

/**
 * Test 1: after 30+ WhatsApp notes, go if the WhatsApp accept rate (accepted ÷ notes sent) beats email
 * by 15+ points, OR its median reply time is half of email's or less.
 */
export function alumRepliesVerdict(byChannel: AnalyticsReport["whatsapp"]["byChannel"]): Verdict {
  const wa = byChannel.find((c) => c.channel === "whatsapp");
  const em = byChannel.find((c) => c.channel === "email");
  if (!wa || wa.notes < WA_MIN_NOTES) {
    return { status: "not_enough_data", detail: `${wa?.notes ?? 0} of ${WA_MIN_NOTES} WhatsApp notes so far` };
  }
  const rate = (c: { notes: number; accepted: number } | undefined) => (c && c.notes ? (100 * c.accepted) / c.notes : 0);
  const lift = rate(wa) - rate(em);
  const faster = wa.medianReplyHours != null && em?.medianReplyHours != null && wa.medianReplyHours <= em.medianReplyHours / 2;
  const pass = lift >= 15 || faster;
  return {
    status: pass ? "passes" : "not_yet",
    detail: `Accept rate ${lift >= 0 ? "+" : ""}${Math.round(lift)} points vs email${faster ? " · replies in half the time or less" : ""}`,
  };
}

/** Test 2: among members who started, WhatsApp arrivals finish onboarding 20+ points more often. */
export function onboardingVerdict(rows: AnalyticsReport["whatsapp"]["onboardingByArrival"]): Verdict {
  const wa = rows.find((r) => r.arrival === "whatsapp");
  const web = rows.find((r) => r.arrival === "website");
  if (!wa || wa.started < WA_MIN_NOTES || !web?.started) {
    return { status: "not_enough_data", detail: `${wa?.started ?? 0} of ${WA_MIN_NOTES} WhatsApp arrivals so far` };
  }
  const lift = (100 * wa.finished) / wa.started - (100 * web.finished) / web.started;
  return {
    status: lift >= 20 ? "passes" : "not_yet",
    detail: `Finish rate ${lift >= 0 ? "+" : ""}${Math.round(lift)} points vs website`,
  };
}

/** Cities v1 metrics (GET /v1/admin/metrics/cities). */
export type CitiesNoteMetrics = {
  category: string;
  sent: number;
  accepted: number;
  declined: number;
  pending: number;
  acceptanceRate: number | null;
  declineRate: number | null;
};

export type CitiesMetrics = {
  windowDays: number;
  notes: { overall: CitiesNoteMetrics; byCategory: CitiesNoteMetrics[] };
  arrivals: {
    promptShown: number;
    optedIn: number;
    optInRate: number | null;
    offers: number;
    offersPerArrival: number | null;
    withOfferIn7dShare: number | null;
    newcomerNotesPerArrival: number | null;
  };
  coffee: { asksSent: number; accepted: number; fullThisWeekImpressions: number };
  cityHelpOnFromPanel: number;
  cityUpdatesFromMovedAway: number;
  nudge: { sent: number; visitedIn7d: number; actedIn7d: number; stopRate: number | null };
};

export const citiesMetricsQueryKey = (days: AnalyticsWindow) => ["admin", "analytics", "cities", days] as const;

export async function fetchCitiesMetrics(days: AnalyticsWindow, signal: AbortSignal): Promise<CitiesMetrics> {
  return (await assertApiGet<{ metrics: CitiesMetrics }>(`/v1/admin/metrics/cities?days=${days}`, signal)).metrics;
}

/** A 0–1 rate as a percentage ("—" when there is nothing to divide). */
export function rate(r: number | null): string {
  return r === null ? "—" : `${Math.round(r * 100)}%`;
}
