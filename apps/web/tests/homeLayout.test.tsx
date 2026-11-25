import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn(async () => ({ data: {} })));
const apiPatch = vi.hoisted(() => vi.fn(async () => ({ data: {} })));
const composerOpen = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: apiGet }));
vi.mock("../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api/client")>()),
  api: { get: vi.fn(async () => ({ data: null })), post: apiPost, patch: apiPatch, put: vi.fn(), delete: vi.fn() },
}));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/components/WhatsAppFloatingButton", () => ({ WhatsAppFloatingButton: () => null }));
vi.mock("../src/components/FeedbackDialog", () => ({ FeedbackDialog: () => <div role="dialog">Feedback form</div> }));
vi.mock("../src/lib/betaAnalytics", () => ({ trackBetaUsageEvent: vi.fn() }));
vi.mock("../src/components/PostBulletinFlow", () => ({
  PostBulletinFlow: forwardRef(function MockFlow(_props, ref) {
    useImperativeHandle(ref, () => ({ open: composerOpen, close: vi.fn() }));
    return null;
  }),
}));

import { Home } from "../src/pages/Home";

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={["/home"]}>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>,
  );
}

const now = new Date().toISOString();
const ask = {
  askId: "a1", requestId: "r1", kind: "referral", status: "asked", requestStatus: "open", askedAt: now, expiresAt: now, seenAt: null,
  company: "Sample Logistics", jobFunction: "data", experienceBand: null, roleTitle: "Data Analyst", jobUrl: null, message: "Please refer me.",
  details: null, asker: { personId: "p5", fullName: "Asha Rao", institutionName: null, batchYear: null, departmentCode: null }, conversation: null,
};

/** Every API path Home touches gets an empty-but-valid answer unless overridden. */
function mockApi(overrides: Record<string, unknown> = {}) {
  apiGet.mockImplementation(async (path: string) => {
    if (path in overrides) return overrides[path];
    if (path === "/v1/contact-requests/inbox") return { requests: [] };
    if (path === "/v1/contact-requests/sent") return { requests: [] };
    if (path === "/v1/broker-asks") return { asks: [] };
    if (path === "/v1/broker-requests") return { requests: [] };
    if (path.startsWith("/v1/intentcasts")) return { intentcasts: [], totalCount: 0, responses: [], pageInfo: { hasMore: false, nextOffset: null } };
    throw new Error(path);
  });
}

beforeEach(() => {
  apiGet.mockReset();
  composerOpen.mockReset();
  authState.value = {
    status: "authenticated",
    person: { personId: "p1", institutionalEmail: "a@iitbhu.ac.in", role: "alumni" },
    myProfile: { id: "me1", fullName: "Me", onboardingCompletedAt: "2026-01-01" },
    logout: vi.fn(),
  };
});
afterEach(cleanup);

describe("Home redesign", () => {
  it("lays out the hero, four tiles, then Opportunities for you beside Requests for you, and the feedback line", async () => {
    mockApi();
    const { container } = wrap(<Home />);
    expect(screen.getByRole("heading", { name: "How can Alma Mater help you?" })).toBeTruthy();
    expect(screen.getByText("Find the right people, opportunities and help from the alumni community.")).toBeTruthy();
    const tiles = within(screen.getByRole("navigation", { name: "What do you need?" })).getAllByRole("button");
    expect(tiles.map((t) => t.querySelector(".home-tile__title")?.textContent)).toEqual(["Career help", "Build a business", "Get advice", "Something else"]);
    const panels = container.querySelector(".home-panels")!;
    expect([...panels.querySelectorAll("h2")].map((h) => h.textContent)).toEqual(["Opportunities for you", "Requests for you"]);
    expect(await screen.findByText("Nothing waiting for you right now.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Give feedback/ })).toBeTruthy();
    // Out of the redesign: the batchmates panel and the old waiting card.
    expect(container.textContent).not.toContain("Reachouts waiting for you");
    expect(container.querySelector(".home-ideal__rail")).toBeNull();
  });

  it("asks for the Wall ranked for the viewer", async () => {
    mockApi();
    wrap(<Home />);
    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith(expect.stringContaining("/v1/intentcasts?limit=48&offset=0&excludeAuthorSoftDeleted=true&scope=home_wall&sort=for_you"), expect.anything()),
    );
  });

  it("tiles start the composer at Careers, Startups and General; Get advice goes to the ask box", () => {
    mockApi();
    wrap(<Home />);
    fireEvent.click(screen.getByRole("button", { name: /Career help/ }));
    expect(composerOpen).toHaveBeenLastCalledWith({ category: "careers" });
    fireEvent.click(screen.getByRole("button", { name: /Build a business/ }));
    expect(composerOpen).toHaveBeenLastCalledWith({ category: "startups" });
    fireEvent.click(screen.getByRole("button", { name: /Something else/ }));
    expect(composerOpen).toHaveBeenLastCalledWith({ category: "general" });
    Element.prototype.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: /Get advice/ }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "How can Alma Mater help you?" }));
    expect(composerOpen).toHaveBeenCalledTimes(3);
  });

  const note = {
    id: "i1", senderPersonId: "p7", senderFullName: "Priya Kapoor", senderDepartmentCode: null, senderInstitutionName: "IIT Bombay", senderBatchYear: 2022,
    message: "Feedback on our pitch deck", createdAt: now,
    details: { purpose: "advice", topic: "founder_advice", question: "Could you give feedback on our pitch deck before we raise our seed round next month?" },
  };
  const referralAsk = {
    ...ask, jobUrl: "https://jobs.example.com/da", message: "Please refer me.",
    asker: { personId: "p5", fullName: "Asha Rao", institutionName: "IIT (BHU) Varanasi", batchYear: 2025, departmentCode: null },
    details: { purpose: "referral", jobUrl: "https://jobs.example.com/da", role: "Data Analyst", company: "Sample Logistics", fit: "Two years of analytics on the ops team.", resumeUrl: null },
  };
  const panelOf = async () => (await screen.findByRole("heading", { name: "Requests for you" })).closest("section")!;

  it("Requests for you: compact rows (who, what, New), nothing answered or marked seen until opened", async () => {
    mockApi({
      "/v1/broker-asks": { asks: [referralAsk] },
      "/v1/contact-requests/inbox": { requests: [note] },
      "/v1/notifications": { items: [{ kind: "contact_request_received", id: "cr-in:i1", contactRequestId: "i1", unseen: true, occurredAt: now }] },
    });
    wrap(<Home />);
    const panel = await panelOf();
    const rows = await within(panel).findAllByRole("button", { name: /Referral for|Starting up|Could you give/ });
    expect(rows.map((r) => r.querySelector(".home-request__title")?.textContent)).toEqual([
      "Referral for Data Analyst at Sample Logistics",
      "Could you give feedback on our pitch deck before we raise our seed round next month?",
    ]);
    expect(rows[0]!.querySelector(".home-request__meta")?.textContent).toBe("Asha Rao · IIT (BHU) Varanasi");
    expect(rows[1]!.querySelector(".home-request__meta")?.textContent).toBe("Priya Kapoor · IIT Bombay");
    await waitFor(() => expect(within(panel).getAllByText("New")).toHaveLength(2));
    expect(within(panel).queryByRole("button", { name: "Accept" })).toBeNull();
    expect(within(panel).queryByText("Nothing waiting for you right now.")).toBeNull();
    expect(apiPost).not.toHaveBeenCalledWith("/v1/broker-asks/a1/seen");
  });

  it("opening a brokered ask shows the full request, marks it seen, and closing returns to the row", async () => {
    mockApi({ "/v1/broker-asks": { asks: [referralAsk] } });
    wrap(<Home />);
    const panel = await panelOf();
    fireEvent.click(await within(panel).findByRole("button", { name: /Referral for Data Analyst at Sample Logistics/ }));
    const detail = within(panel).getByRole("dialog", { name: "Referral for Data Analyst at Sample Logistics" });
    expect(within(detail).getByRole("link", { name: "Asha Rao" }).getAttribute("href")).toBe("/profiles/p5");
    expect(within(detail).getByText("IIT (BHU) Varanasi · Class of 2025")).toBeTruthy();
    expect(within(detail).getByText("Asha's note")).toBeTruthy();
    expect(within(detail).getByText("Two years of analytics on the ops team.")).toBeTruthy();
    const job = within(detail).getByRole("link", { name: /View job description/ });
    expect(job.getAttribute("href")).toBe("https://jobs.example.com/da");
    expect(job.getAttribute("target")).toBe("_blank");
    expect(within(detail).getByText("Your contact details stay private unless you choose to share them.")).toBeTruthy();
    expect(document.activeElement).toBe(within(detail).getByRole("heading", { name: "Referral for Data Analyst at Sample Logistics" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/broker-asks/a1/seen"));
    // The New tag goes once you've opened it.
    fireEvent.click(within(detail).getByRole("button", { name: "Close request" }));
    const row = within(panel).getByRole("button", { name: /Referral for Data Analyst/ });
    expect(document.activeElement).toBe(row);
    expect(within(row).queryByText("New")).toBeNull();
    // Yes answers the ask.
    fireEvent.click(row);
    fireEvent.click(within(panel).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/broker-asks/a1/respond", { action: "accept" }));
  });

  it("a direct reachout says yes shares your email, and answering removes it with a confirmation", async () => {
    let answered = false;
    mockApi({ "/v1/contact-requests/inbox": { requests: [note] } });
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/v1/contact-requests/inbox") return { requests: answered ? [] : [note] };
      if (path === "/v1/contact-requests/sent" || path === "/v1/broker-requests") return { requests: [] };
      if (path === "/v1/broker-asks") return { asks: [] };
      if (path.startsWith("/v1/intentcasts")) return { intentcasts: [], totalCount: 0, responses: [], pageInfo: { hasMore: false, nextOffset: null } };
      throw new Error(path);
    });
    apiPatch.mockImplementation(async () => {
      answered = true;
      return { data: {} };
    });
    wrap(<Home />);
    const panel = await panelOf();
    fireEvent.click(await within(panel).findByRole("button", { name: /Could you give feedback/ }));
    const detail = within(panel).getByRole("dialog");
    expect(within(detail).getByText("IIT Bombay · Class of 2022")).toBeTruthy();
    // The question is the title, so it isn't repeated as a note.
    expect(within(detail).queryByText("Priya's note")).toBeNull();
    expect(within(detail).getByText("Saying yes shares your email with Priya, so they can reach you.")).toBeTruthy();
    fireEvent.click(within(detail).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledWith("/v1/contact-requests/i1", { action: "accept" }));
    expect((await within(panel).findByRole("status")).textContent).toBe("You said yes to Priya Kapoor. They can reach you by email now.");
    expect(within(panel).queryByRole("dialog", { name: /Could you give feedback/ })).toBeNull();
    expect(await within(panel).findByText("Nothing waiting for you right now.")).toBeTruthy();
  });

  it("shows five requests, then a link to the rest in Notifications", async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ ...note, id: `n${i}`, createdAt: new Date(Date.now() - i * 60_000).toISOString() }));
    mockApi({ "/v1/contact-requests/inbox": { requests: many } });
    wrap(<Home />);
    const panel = await panelOf();
    const list = await within(panel).findByRole("list", { name: "Requests for you" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(within(panel).getByRole("link", { name: "See 2 more in Notifications" }).getAttribute("href")).toBe("/notifications");
  });

  it("Your reachouts appears only when there is something", async () => {
    mockApi();
    const empty = wrap(<Home />);
    await screen.findByText("Nothing waiting for you right now.");
    expect(screen.queryByRole("heading", { name: "Your reachouts" })).toBeNull();
    empty.unmount();
    mockApi({ "/v1/contact-requests/sent": { requests: [{ id: "n1", recipientFullName: "Alum 1", status: "pending", createdAt: now }] } });
    wrap(<Home />);
    expect(await screen.findByRole("heading", { name: "Your reachouts" })).toBeTruthy();
  });

  it("the feedback line opens the feedback form", () => {
    mockApi();
    wrap(<Home />);
    fireEvent.click(screen.getByRole("button", { name: /Give feedback/ }));
    expect(screen.getByRole("dialog").textContent).toBe("Feedback form");
  });
});
