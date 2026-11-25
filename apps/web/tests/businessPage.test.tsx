import { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { IntentcastFeedItem } from "../src/api/client";

const apiGet = vi.hoisted(() => vi.fn());
const patch = vi.hoisted(() => vi.fn());
const composerOpen = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: apiGet }));
vi.mock("../src/api/client", async (orig) => ({ ...(await orig<typeof import("../src/api/client")>()), api: { patch } }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));
vi.mock("../src/components/PostBulletinFlow", () => ({
  PostBulletinFlow: forwardRef(function MockFlow(_props, ref) {
    useImperativeHandle(ref, () => ({ open: composerOpen, close: vi.fn() }));
    return null;
  }),
}));

import { BusinessPage } from "../src/pages/BusinessPage";
import { encodeBulletinContentWithUiCategory } from "../src/lib/bulletinPostCardUtils";
import { askDraftPath, inBusinessTab, isBusinessPost, requestStep } from "../src/lib/business";
import { INTENT_LABELS } from "../src/constants/intents";

type Over = Partial<IntentcastFeedItem>;
let seq = 0;
const post = (title: string, over: Over = {}): IntentcastFeedItem =>
  ({
    id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
    authorPersonId: over.authorPersonId ?? `a${seq}`,
    authorFullName: `Author ${seq}`,
    authorDepartmentCode: "cse",
    authorDepartmentName: "CSE",
    authorBatchYear: 2018,
    category: "collaboration",
    kind: "ask",
    content: encodeBulletinContentWithUiCategory(`${title}\nMore detail here`, "startups"),
    status: "open",
    expiresAt: "2099-01-01",
    closedAt: null,
    createdAt: new Date().toISOString(),
    editableUntil: "2099-01-01",
    responseCount: 0,
    ...over,
  }) as IntentcastFeedItem;

function world({ feed = [] as IntentcastFeedItem[], mine = [] as IntentcastFeedItem[] } = {}) {
  authState.value = {
    status: "authenticated",
    person: { personId: "me1", institutionalEmail: "a@iitbhu.ac.in", role: "alumni" },
    myProfile: { id: "me1", fullName: "Me", openToPreferences: { selected: [] } },
  };
  apiGet.mockImplementation(async (path: string) => {
    if (path.includes("mine=true")) return { intentcasts: mine, pageInfo: {} };
    if (path.startsWith("/v1/intentcasts")) return { intentcasts: feed, pageInfo: {} };
    if (path === "/v1/contact-requests/inbox") return { requests: [] };
    if (path === "/v1/contact-requests/sent") return { requests: [] };
    if (path === "/v1/careers/my-company-demand") return { demand: null };
    throw new Error(`unexpected ${path}`);
  });
}

function Where() {
  const l = useLocation();
  return <p data-testid="where">{`${l.pathname}${l.search}`}</p>;
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={["/intent/business"]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/intent/business" element={<BusinessPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  apiGet.mockReset();
  patch.mockReset();
  composerOpen.mockReset();
});
afterEach(cleanup);

describe("Business naming", () => {
  it("the Build hub is now Business", () => {
    expect(INTENT_LABELS.business).toBe("Business");
  });
});

describe("Business page", () => {
  it("title, search to Ask, and four shortcuts with starter sentences; Raise capital is parked", async () => {
    world();
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Business" })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "What does your business need?" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Find customers & partners",
      "Find talent & co-founders",
      "Get expertise & advice",
      "Find suppliers & services",
    ]);
    expect(screen.queryByText("Raise capital")).toBeNull();
    expect(links[1]!.getAttribute("href")).toBe(askDraftPath("I'm looking for a co-founder or early hire for ", "founder_advice"));
    const box = screen.getByRole("searchbox", { name: "Search business help" });
    expect(box.getAttribute("placeholder")).toBe("Find customers, partners, talent or advice, or describe your need…");
    fireEvent.change(box, { target: { value: "Distributors in Pune" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect((await screen.findByTestId("where")).textContent).toBe("/match?q=Distributors%20in%20Pune");
  });

  it("opportunities: Startups posts only, four then View all; Needs and Offers tabs filter by type", async () => {
    world({
      feed: [
        post("Pilot customers for a B2B tool"),
        post("Offering GTM help for D2C brands", { kind: "offer" }),
        post("Looking for a flatmate", { content: encodeBulletinContentWithUiCategory("Looking for a flatmate\nIn HSR", "relocation") }),
        post("Need a packaging supplier"),
        post("Seeking a design partner"),
        post("Distribution partners in Pune"),
      ],
    });
    mount();
    const section = (await screen.findByRole("heading", { name: "Relevant opportunities" })).closest("section")!;
    expect(await within(section).findByText("Pilot customers for a B2B tool")).toBeTruthy();
    expect(within(section).queryByText("Looking for a flatmate")).toBeNull();
    expect(within(section).getAllByRole("listitem")).toHaveLength(4);
    expect(within(section).getAllByRole("button", { name: "Share this post" })).toHaveLength(4);
    fireEvent.click(within(section).getByRole("button", { name: "View all (5)" }));
    expect(within(section).getAllByRole("listitem")).toHaveLength(5);
    fireEvent.click(within(section).getByRole("tab", { name: "Offers" }));
    expect(within(section).getAllByRole("listitem")).toHaveLength(1);
    expect(within(section).getByText("Offering GTM help for D2C brands")).toBeTruthy();
    fireEvent.click(within(section).getByRole("tab", { name: "Needs" }));
    expect(within(section).getAllByRole("listitem")).toHaveLength(4);
    expect(apiGet.mock.calls.some(([p]) => String(p).includes("category=collaboration"))).toBe(true);
  });

  it("Post a request opens the Wall composer on Startups with Ask chosen", async () => {
    world();
    mount();
    expect(await screen.findByText(/No needs or offers yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Post a request" }));
    expect(composerOpen).toHaveBeenCalledWith({ category: "startups", kind: "ask" });
  });

  it("Your requests: open Startups posts with their step; Resolve asks how it ended, then closes as resolved", async () => {
    const mine = [post("Pilot customers for my tool", { authorPersonId: "me1", responseCount: 2 }), post("Need a CA", { authorPersonId: "me1" })];
    world({ mine });
    patch.mockResolvedValue({ data: undefined });
    mount();
    const card = (await screen.findByRole("heading", { name: "Your requests" })).closest("section")!;
    expect(within(card).getByText(/Has replies · 2/)).toBeTruthy();
    expect(within(card).getByText(/^Open · Posted/)).toBeTruthy();
    fireEvent.click(within(card).getAllByRole("button", { name: "Resolve" })[0]!);
    const group = within(card).getByRole("group", { name: "How did it end?" });
    fireEvent.click(within(group).getByRole("button", { name: "Got help here" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith(`/v1/intentcasts/${mine[0]!.id}/close`, { outcome: "got_help_here" }));
    expect(await screen.findByText("Request resolved: Got help here.")).toBeTruthy();
  });

  it("Your requests stays hidden without an open request, and Cancel backs out", async () => {
    world();
    mount();
    await screen.findByText(/No needs or offers yet/);
    expect(screen.queryByRole("heading", { name: "Your requests" })).toBeNull();
    cleanup();
    world({ mine: [post("Need a CA", { authorPersonId: "me1" })] });
    mount();
    const card = (await screen.findByRole("heading", { name: "Your requests" })).closest("section")!;
    fireEvent.click(within(card).getByRole("button", { name: "Resolve" }));
    fireEvent.click(within(card).getByRole("button", { name: "Cancel" }));
    expect(within(card).queryByRole("group")).toBeNull();
    expect(patch).not.toHaveBeenCalled();
  });
});

describe("Business helpers", () => {
  it("Startups posts count as Business; relocation and hiring don't", () => {
    expect(isBusinessPost(post("A"))).toBe(true);
    expect(isBusinessPost(post("B", { content: encodeBulletinContentWithUiCategory("Moving\nx", "relocation") }))).toBe(false);
    expect(isBusinessPost(post("C", { category: "hiring", content: "Hiring\nx" }))).toBe(false);
    // Posted as Startups but mentions "moving": still Business (the Wall alone would call it Relocation).
    expect(isBusinessPost(post("D", { content: encodeBulletinContentWithUiCategory("Logistics intros\nMoving 2 truckloads a week", "startups") }))).toBe(true);
  });
  it("tabs and steps", () => {
    expect(inBusinessTab({ kind: "ask" }, "needs")).toBe(true);
    expect(inBusinessTab({ kind: "invitation" }, "needs")).toBe(false);
    expect(inBusinessTab({ kind: "invitation" }, "all")).toBe(true);
    expect(requestStep({ responseCount: 0 })).toBe("Open");
    expect(requestStep({ responseCount: 1 })).toBe("Has replies · 1");
  });
});
