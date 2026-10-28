import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AnalyticsReport } from "../src/lib/adminAnalytics";
import { compact, duration, pct } from "../src/lib/adminAnalytics";

const apiGet = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: apiGet }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));

import { AdminAnalyticsPage } from "../src/pages/AdminAnalyticsPage";

const weeks = (vals: number[]) =>
  vals.map((value, i) => ({ weekStart: `2026-08-${String(3 + i * 7).padStart(2, "0")}`.replace("2026-08-3", "2026-08-03"), value }));

function report(days = 30): AnalyticsReport {
  const w = weeks([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  return {
    windowDays: days,
    generatedAt: "2026-10-27T10:00:00.000Z",
    northStar: { acceptedNotes: 42, askers: 20, helpedWithin7Days: 9, stillWithin7Days: 3, trendAccepted: w, trendSent: w },
    signIn: {
      starts: 100, completed: 80, emailSent: 90, emailUnconfirmed: 4, emailUnknown: 6, failedRejected: 2, failedUnreachable: 1,
      superseded: 5, sessionsByMethod: { otp: 50, magic_link: 25, google: 5 }, newMembers: 12, trendNewMembers: w,
    },
    onboarding: {
      startedPeople: 15, completedPeople: 10, completedOnboardingProfiles: 11, validationErrors: 2,
      steps: [{ stage: "profile", questionId: "batch", questionIndex: 1, people: 14 }],
      profiles: { members: 200, completed: 150, withCurrentRole: 120, withPastRole: 60, withOpenTo: 50 },
    },
    asking: {
      questions: 300, needsDetail: 30, zeroResults: 45, withMatches: 225,
      byCategory: [{ category: "referral", questions: 120, needsDetail: 5, zeroResults: 20 }],
      trendQuestions: w, search: { searches: 70, zeroResults: 9, filtersChanged: 30, loadMore: 4 },
    },
    demandSupply: {
      byCategory: [{ category: "referral", questions: 120, alumniOffering: 30 }],
      top: [
        { category: "referral", company: "Razorpay", role: null, city: null, country: null, questions: 12, zeroResults: 4, supply: 3, supplyOffering: 0 },
      ],
    },
    matching: {
      questionsWithMatches: 225, notesFromMatch: 60,
      byRank: [{ rank: 1, notes: 40, accepted: 20, declined: 5 }],
      byCategory: [{ category: "referral", notes: 30, accepted: 12, declined: 4, pending: 14 }],
    },
    outcomes: {
      sent: 80, accepted: 42, declined: 10, pending: 28, medianReplyHours: 30.5, remindersSent: 7, repliedAfterReminder: 3,
      fairness: { recipients: 50, top10Share: 0.31, atWeeklyCap: 2, silentAlumni: 6 },
    },
    wall: { posts: 25, postsWithReply: 15, replies: 40, medianFirstReplyHours: 6, expiredWithoutReply: 4, trendPosts: w },
    engagement: {
      activeMembers: 140, returningMembers: 70, trendActive: w,
      home: [{ event: "home_ask_submitted", count: 90, people: 60 }],
      browseByLink: [{ link: "careers", count: 12 }],
      notifications: { opened: 33, clicked: 20 },
    },
    growth: {
      inviteOpened: 20, inviteCopied: 8, inviteWhatsapp: 6, invitedSignups: { copy: 2, whatsapp: 3 }, trendInvitedSignups: w,
      byBatch: [{ batchYear: 2016, members: 20 }], byDepartment: [{ code: "eee", name: "Electrical Engineering", members: 40 }],
    },
    whatsapp: {
      linkedMembers: 12, notesOptedIn: 8, notesPaused: 1, stopped: 0, numbersTexting: 20, linkedInWindow: 10,
      notesFromBot: 6, notesFromBotAccepted: 4,
      month: { inbound: 80, serviceReplies: 75, freeServicePerMonth: 1000, templates: 31, templateCap: 300, estimatedSpendRupees: 4.22 },
      byChannel: [
        { channel: "email", notes: 40, accepted: 10, declined: 5, medianReplyHours: 50 },
        { channel: "whatsapp", notes: 31, accepted: 15, declined: 3, medianReplyHours: 6 },
      ],
      onboardingByArrival: [
        { arrival: "whatsapp", started: 10, finished: 8 },
        { arrival: "website", started: 20, finished: 9 },
      ],
    },
    operations: { orgsPending: 3, suspended: 1, deletedInWindow: 0, admins: 4, directory: { total: 260, real: 200, demo: 50, test: 10 } },
  };
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <AdminAnalyticsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  apiGet.mockReset();
  apiGet.mockImplementation(async (path: string) => ({ report: report(Number(new URLSearchParams(path.split("?")[1]).get("days"))) }));
  authState.value = { status: "authenticated", person: { personId: "a1", role: "admin" }, myProfile: { fullName: "Admin" } };
});
afterEach(cleanup);

describe("Admin analytics screen", () => {
  it("shows every section on one screen, defaulting to 30 days", async () => {
    mount();
    expect(await screen.findByText("Accepted notes")).toBeTruthy();
    expect(apiGet).toHaveBeenCalledWith("/v1/admin/analytics?days=30", expect.anything());
    for (const title of [
      "North star", "Sign-in and sign-up", "Onboarding and profiles", "Asking", "Demand vs supply", "Matching quality",
      "Outcomes and fairness", "The Wall", "Engagement and Home", "Growth", "WhatsApp pilot", "Operations",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeTruthy();
    }
    const helped = screen.getByText("Helped within 7 days").closest(".aa-tile") as HTMLElement;
    expect(within(helped).getByText("45%")).toBeTruthy(); // 9 of 20 helped within 7 days
    expect(screen.getByText("0 · gap")).toBeTruthy(); // demand with nobody offering
    expect(screen.getByText("Asked a question")).toBeTruthy();
    expect(screen.getByText("260")).toBeTruthy();
    // 31 WhatsApp notes: 48% vs 25% accept (+23 points) → passes; only 10 WhatsApp arrivals → not enough data.
    expect(screen.getByText(/Test 1 · Alum replies/).closest("p")!.textContent).toContain("Passes");
    expect(screen.getByText(/Test 2 · Onboarding/).closest("p")!.textContent).toContain("Not enough data yet");
    expect(screen.getByText("31 / 300")).toBeTruthy();
    const pendingTile = screen.getByText("Companies waiting for approval").closest(".aa-tile") as HTMLElement;
    expect(within(pendingTile).getByRole("link", { name: "Review" }).getAttribute("href")).toBe("/admin/companies");
  });

  it("switches the window and can skip the cache", async () => {
    mount();
    await screen.findByText("Accepted notes");
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/v1/admin/analytics?days=7", expect.anything()));
    expect(screen.getByRole("button", { name: "7 days" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect((screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/v1/admin/analytics?days=7&fresh=1", expect.anything()));
  });

  it("charts carry a table copy and a tooltip on hover", async () => {
    mount();
    await screen.findByText("Accepted notes");
    const fig = screen.getByText("Accepted notes per week").closest("figure") as HTMLElement;
    expect(within(fig).getAllByRole("row")).toHaveLength(12);
    fireEvent.mouseEnter(within(fig).getAllByLabelText(/^Week of/)[11]!);
    expect(within(fig).getByRole("status").textContent).toContain("11");
  });

  it("tells non-admins the page is for admins and loads nothing", () => {
    authState.value = { status: "authenticated", person: { personId: "u1", role: "alumni" }, myProfile: null };
    mount();
    expect(screen.getByRole("alert").textContent).toBe("This page is for admins.");
    expect(apiGet).not.toHaveBeenCalled();
  });
});

describe("analytics formatting", () => {
  it("formats numbers, shares and durations", () => {
    expect(pct(1, 3)).toBe("33%");
    expect(pct(1, 0)).toBe("—");
    expect(compact(1284)).toBe("1,284");
    expect(compact(12900)).toBe("12.9K");
    expect(duration(5.25)).toBe("5.3 h");
    expect(duration(72)).toBe("3 days");
    expect(duration(null)).toBe("—");
  });
});
