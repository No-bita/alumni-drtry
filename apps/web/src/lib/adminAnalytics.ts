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
