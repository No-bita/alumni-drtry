import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn(async () => ({ data: {} })));
const composerOpen = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: apiGet }));
vi.mock("../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api/client")>()),
  api: { get: vi.fn(async () => ({ data: null })), post: apiPost, patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
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
  details: null, asker: { personId: "p5", fullName: "Asha Rao", institutionName: null, batchYear: null, departmentCode: null }, askerContact: null,
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

  it("Requests for you shows brokered asks and how many reachouts wait for a reply", async () => {
    mockApi({ "/v1/broker-asks": { asks: [ask] }, "/v1/contact-requests/inbox": { requests: [{ id: "i1" }, { id: "i2" }] } });
    wrap(<Home />);
    const panel = (await screen.findByRole("heading", { name: "Requests for you" })).closest("section")!;
    expect((await within(panel).findByRole("link", { name: "2 waiting for your reply" })).getAttribute("href")).toBe("/notifications");
    expect(within(panel).getByRole("article", { name: "Asha Rao is looking for a referral at Sample Logistics" })).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Yes, I'll refer" })).toBeTruthy();
    expect(within(panel).queryByText("Nothing waiting for you right now.")).toBeNull();
    // Showing the ask counts as seeing it.
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/broker-asks/a1/seen"));
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
