import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NotificationItem } from "../src/api/client";
import {
  AnnouncementError,
  batchRange,
  cleanFilters,
  confirmQuestion,
  filtersSummary,
  type AnnouncementDetail,
} from "../src/lib/adminAnnouncements";

const fns = vi.hoisted(() => ({
  previewAudience: vi.fn(),
  sendTestAnnouncement: vi.fn(),
  sendAnnouncement: vi.fn(),
  fetchHistory: vi.fn(),
  fetchDetail: vi.fn(),
  searchCityOptions: vi.fn(),
  unsubscribeWithToken: vi.fn(),
}));
vi.mock("../src/lib/adminAnnouncements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/adminAnnouncements")>();
  return { ...actual, ...fns };
});
const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));
vi.mock("../src/lib/betaAnalytics", () => ({ trackBetaUsageEvent: vi.fn() }));
vi.mock("../src/lib/invalidateAppQueries", () => ({ invalidateNotificationRelatedQueries: vi.fn() }));

import { AdminAnnouncementsPage } from "../src/pages/AdminAnnouncementsPage";
import { UnsubscribePage } from "../src/pages/UnsubscribePage";
import { NotificationsList } from "../src/components/NotificationsList";

const sent: AnnouncementDetail = {
  id: "a-1",
  title: "Reunion 2027",
  body: "Save the date.",
  linkPath: "/events",
  channels: "both",
  status: "sending",
  isTest: false,
  recipientCount: 12,
  createdAt: "2026-11-09T10:00:00.000Z",
  completedAt: null,
  sender: { personId: "admin-1", name: "Admin" },
  filters: { batchYears: [2015, 2016], departmentCodes: ["cse"], places: [] },
  email: { queued: 20, sent: 0, failed: 0, skippedOptedOut: 0 },
  inApp: { delivered: 12, seen: 0 },
};

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function mountPage(role = "admin") {
  authState.value = {
    status: "authenticated",
    person: { personId: "admin-1", institutionalEmail: "admin@iitbhu.ac.in", role },
    myProfile: { id: "admin-1", fullName: "Admin" },
  };
  fns.previewAudience.mockImplementation(async (f: { batchYears?: number[] }) => ({
    count: f.batchYears?.length ? 12 : 840,
    sample: [{ personId: "p1", fullName: "Rohit Verma", batchYear: 2015, departmentCode: "cse" }],
  }));
  fns.fetchHistory.mockResolvedValue([]);
  return render(
    <QueryClientProvider client={client()}>
      <MemoryRouter>
        <AdminAnnouncementsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function fillMessage() {
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Reunion 2027" } });
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Save the date." } });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("adminAnnouncements helpers", () => {
  it("batch range: inclusive, one end alone, invalid ranges", () => {
    expect(batchRange("2015", "2017", 2031)).toEqual([2015, 2016, 2017]);
    expect(batchRange("2015", "", 2031)).toEqual([2015]);
    expect(batchRange("", "2019", 2031)).toEqual([2019]);
    expect(batchRange("", "", 2031)).toEqual([]);
    expect(batchRange("2018", "2015", 2031)).toBeNull();
    expect(batchRange("1900", "2015", 2031)).toBeNull();
    expect(batchRange("2015", "2040", 2031)).toBeNull();
  });

  it("drops empty filters (empty = everyone) and de-duplicates", () => {
    expect(cleanFilters({ batchYears: [], departmentCodes: [], placeIds: [] })).toEqual({});
    expect(cleanFilters({ batchYears: [2016, 2015, 2015], departmentCodes: ["cse", "cse"] })).toEqual({
      batchYears: [2015, 2016],
      departmentCodes: ["cse"],
    });
  });

  it("confirm question and audience summary", () => {
    expect(confirmQuestion(1200, "both")).toBe("Send to 1,200 members by Email and In-app?");
    expect(confirmQuestion(1, "email")).toBe("Send to 1 member by Email?");
    const label = (c: string) => ({ cse: "Computer Science" })[c] ?? c;
    expect(filtersSummary({ batchYears: [], departmentCodes: [], places: [] }, label)).toBe("All members");
    expect(
      filtersSummary({ batchYears: [2015, 2016, 2017], departmentCodes: ["cse"], places: [{ id: "x", label: "Pune, India" }] }, label),
    ).toBe("Batch 2015–2017 · Computer Science · Pune, India");
    expect(filtersSummary({ batchYears: [2015, 2019], departmentCodes: [], places: [] }, label)).toBe("Batch 2015, 2019");
  });
});

describe("AdminAnnouncementsPage", () => {
  it("is for admins only", () => {
    mountPage("alumni");
    expect(screen.getByRole("alert").textContent).toMatch(/for admins/);
    expect(fns.previewAudience).not.toHaveBeenCalled();
  });

  it("shows the live count, counters and the city note", async () => {
    mountPage();
    expect(await screen.findByText("840 members match")).toBeTruthy();
    expect(screen.getByText(/Rohit Verma ’15/)).toBeTruthy();
    expect(screen.getByText("Only members linked to a city record. Many members aren't linked yet.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Hello" } });
    expect(screen.getByText("5/120")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2015" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2016" } });
    fireEvent.click(screen.getByLabelText("Computer Science and Engineering"));
    expect(await screen.findByText("12 members match")).toBeTruthy();
    expect(fns.previewAudience).toHaveBeenLastCalledWith({ batchYears: [2015, 2016], departmentCodes: ["cse"] }, expect.anything());
  });

  it("flags an invalid batch range and blocks sending", async () => {
    mountPage();
    fillMessage();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2018" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2015" } });
    expect(await screen.findByText(/From before To/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Review and send" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("confirms with the count and channel, then sends with that count", async () => {
    fns.sendAnnouncement.mockResolvedValue(sent);
    mountPage();
    fillMessage();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2015" } });
    expect(await screen.findByText("12 members match")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Review and send" }));
    expect(screen.getByText("Send to 12 members by Email and In-app?")).toBeTruthy();
    expect(fns.sendAnnouncement).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Send to 12" }));
    await waitFor(() => expect(fns.sendAnnouncement).toHaveBeenCalledTimes(1));
    expect(fns.sendAnnouncement).toHaveBeenCalledWith(
      { title: "Reunion 2027", body: "Save the date.", linkPath: null, channels: "both" },
      { batchYears: [2015] },
      12,
    );
    expect(await screen.findByText(/Sent to 12 members by Email and In-app/)).toBeTruthy();
  });

  it("on a changed count, re-counts and asks again", async () => {
    fns.sendAnnouncement.mockRejectedValueOnce(new AnnouncementError("ANNOUNCEMENT_COUNT_CHANGED", "changed"));
    mountPage();
    fillMessage();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2015" } });
    expect(await screen.findByText("12 members match")).toBeTruthy();
    fns.previewAudience.mockResolvedValue({ count: 13, sample: [] });

    fireEvent.click(screen.getByRole("button", { name: "Review and send" }));
    fireEvent.click(screen.getByRole("button", { name: "Send to 12" }));
    expect(await screen.findByText("Send to 13 members by Email and In-app?")).toBeTruthy();
    expect(screen.getByText(/changed. Check it and confirm again/)).toBeTruthy();

    fns.sendAnnouncement.mockResolvedValueOnce({ ...sent, recipientCount: 13 });
    fireEvent.click(screen.getByRole("button", { name: "Send to 13" }));
    await waitFor(() => expect(fns.sendAnnouncement).toHaveBeenLastCalledWith(expect.anything(), { batchYears: [2015] }, 13));
  });

  it("sends a test to the admin with the chosen channel", async () => {
    fns.sendTestAnnouncement.mockResolvedValue({ ...sent, isTest: true, recipientCount: 1 });
    mountPage();
    fillMessage();
    fireEvent.click(screen.getByLabelText("In-app"));
    fireEvent.change(screen.getByLabelText("Link (optional)"), { target: { value: "/intent/career" } });
    fireEvent.click(screen.getByRole("button", { name: "Send test to me" }));
    await waitFor(() =>
      expect(fns.sendTestAnnouncement).toHaveBeenCalledWith({
        title: "Reunion 2027",
        body: "Save the date.",
        linkPath: "/intent/career",
        channels: "in_app",
      }),
    );
    expect(await screen.findByText(/Test sent to your Notifications/)).toBeTruthy();
    expect(fns.sendAnnouncement).not.toHaveBeenCalled();
  });

  it("shows history with status and details", async () => {
    mountPage();
    fns.fetchHistory.mockResolvedValue([{ ...sent, status: "partially_failed", email: { queued: 0, sent: 18, failed: 2, skippedOptedOut: 1 } }]);
    fns.fetchDetail.mockResolvedValue({ ...sent, status: "partially_failed", email: { queued: 0, sent: 18, failed: 2, skippedOptedOut: 1 }, inApp: { delivered: 12, seen: 5 } });
    cleanup();
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter>
          <AdminAnnouncementsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Reunion 2027")).toBeTruthy();
    expect(screen.getByText("Sent, 2 emails failed")).toBeTruthy();
    expect(screen.getByText(/Batch 2015–2016 · Computer Science and Engineering · 12 members/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(await screen.findByText("5 of 12")).toBeTruthy();
    expect(screen.getByText("Save the date.")).toBeTruthy();
  });
});

describe("UnsubscribePage", () => {
  const mount = (search: string) =>
    render(
      <MemoryRouter initialEntries={[`/unsubscribe${search}`]}>
        <Routes>
          <Route path="/unsubscribe" element={<UnsubscribePage />} />
        </Routes>
      </MemoryRouter>,
    );

  it("unsubscribes on open, once, and offers Undo", async () => {
    fns.unsubscribeWithToken.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    mount("?token=abc.def");
    expect(await screen.findByText("You won't get announcement emails. Announcements still show in your Notifications when you sign in.")).toBeTruthy();
    expect(fns.unsubscribeWithToken).toHaveBeenCalledTimes(1);
    expect(fns.unsubscribeWithToken).toHaveBeenCalledWith("abc.def", false);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("You're subscribed again")).toBeTruthy();
    expect(fns.unsubscribeWithToken).toHaveBeenLastCalledWith("abc.def", true);
  });

  it("explains an invalid or missing link", async () => {
    fns.unsubscribeWithToken.mockRejectedValue(new AnnouncementError("ANNOUNCEMENT_UNSUBSCRIBE_INVALID", "bad"));
    mount("?token=tampered");
    expect(await screen.findByText("This link isn't valid")).toBeTruthy();
    cleanup();
    mount("");
    expect(screen.getByText("This link isn't valid")).toBeTruthy();
  });
});

describe("Notifications: announcement items", () => {
  const item = (over: Partial<Extract<NotificationItem, { kind: "announcement" }>> = {}): NotificationItem => ({
    kind: "announcement",
    id: "ann:a-1",
    occurredAt: new Date().toISOString(),
    unseen: true,
    announcementId: "a-1",
    title: "Reunion 2027",
    body: "Save the date.\nDetails soon.",
    linkPath: "/intent/career",
    ...over,
  });
  function Where() {
    return <p data-testid="where">{useLocation().pathname}</p>;
  }
  const mount = (items: NotificationItem[], activationTarget?: "inbox") =>
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter initialEntries={["/notifications"]}>
          <NotificationsList items={items} activationTarget={activationTarget} />
          <Routes>
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it("shows title, message and an Open link to the in-app page", () => {
    mount([item()]);
    expect(screen.getByText("Reunion 2027")).toBeTruthy();
    expect(screen.getByText(/Save the date\./)).toBeTruthy();
    const open = screen.getByRole("link", { name: "Open" });
    act(() => {
      fireEvent.click(open);
    });
    expect(screen.getByTestId("where").textContent).toBe("/intent/career");
  });

  it("without a link: no Open link and no row button", () => {
    mount([item({ linkPath: null })]);
    expect(screen.queryByRole("link", { name: "Open" })).toBeNull();
    expect(screen.queryByRole("button", { name: /announcement/ })).toBeNull();
  });

  it("in the quick view, a tap opens the inbox", () => {
    mount([item()], "inbox");
    fireEvent.click(screen.getByRole("button", { name: "Open inbox: announcement Reunion 2027" }));
    expect(screen.getByTestId("where").textContent).toBe("/notifications");
    expect(screen.queryByRole("link", { name: "Open" })).toBeNull();
  });
});
