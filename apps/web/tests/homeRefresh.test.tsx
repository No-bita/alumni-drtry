import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { IntentcastFeedItem } from "../src/api/client";

const apiGet = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: apiGet }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));

import { HomeAskBox } from "../src/components/HomeAskBox";
import { HomeOpportunityRail } from "../src/components/HomeOpportunityRail";
import { ReachoutsWaitingCard } from "../src/components/ReachoutsWaitingCard";
import { YourReachoutsCard } from "../src/components/YourReachoutsCard";

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>,
  );
}

function signedIn(openTo: string[] = []) {
  authState.value = {
    status: "authenticated",
    person: { personId: "p1", institutionalEmail: "a@iitbhu.ac.in", role: "alumni" },
    myProfile: { id: "me1", fullName: "Me", openToPreferences: { selected: openTo } },
  };
}

const post = (id: string): IntentcastFeedItem =>
  ({
    id, authorPersonId: `a-${id}`, authorFullName: `Author ${id}`, authorDepartmentCode: "cse", authorDepartmentName: "CSE", authorBatchYear: 2019,
    category: "collaboration", content: `Looking for a flatmate ${id}\n\nMoving in January`, status: "open", expiresAt: "2099-01-01", closedAt: null,
    createdAt: new Date().toISOString(), editableUntil: "2099-01-01", responseCount: 0,
  }) as IntentcastFeedItem;

beforeEach(() => {
  apiGet.mockReset();
  signedIn();
});
afterEach(cleanup);

describe("Home search box (Careers style)", () => {
  it("has a search icon, a placeholder and an arrow button that keeps the name Find alumni", () => {
    wrap(<HomeAskBox />);
    const input = screen.getByLabelText("How can Alma Mater help you?");
    expect(input.getAttribute("placeholder")).toBe("Ask for a referral, advice, or an intro…");
    const go = screen.getByRole("button", { name: "Find alumni" });
    expect(go.textContent).toBe("");
    expect(go.querySelector("svg")).toBeTruthy();
    expect(screen.getByText("Try:")).toBeTruthy();
  });
});

describe("Reachout cards", () => {
  it("Reachouts waiting for you: count (0 included), searches for your company, no 'asks' wording", async () => {
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/v1/contact-requests/inbox") return { requests: [] };
      if (path === "/v1/careers/my-company-demand") return { demand: { company: "Meesho", asks: 18, days: 30 } };
      throw new Error(path);
    });
    signedIn(["referrals"]);
    wrap(<ReachoutsWaitingCard />);
    const section = (await screen.findByRole("heading", { name: "Reachouts waiting for you" })).closest("section")!;
    expect((await within(section).findByRole("link", { name: "0 waiting for your reply" })).getAttribute("href")).toBe("/notifications");
    expect(await within(section).findByText("18 searches for Meesho in the last 30 days")).toBeTruthy();
    expect(within(section).getByText("You're open to referrals, so you can show up in those searches.")).toBeTruthy();
    expect(section.textContent).not.toMatch(/\basks?\b/i);
  });

  it("Reachouts waiting for you stays hidden for someone who can't help yet", async () => {
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/v1/contact-requests/inbox") return { requests: [] };
      if (path === "/v1/careers/my-company-demand") return { demand: null };
      throw new Error(path);
    });
    const { container } = wrap(<ReachoutsWaitingCard />);
    await vi.waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
    expect(container.textContent).toBe("");
  });

  it("Your reachouts: last three with status; hidden when none were sent", async () => {
    const now = new Date().toISOString();
    const notes = [1, 2, 3, 4].map((i) => ({ id: `n${i}`, recipientFullName: `Alum ${i}`, status: i === 1 ? "accepted" : "pending", createdAt: now }));
    apiGet.mockImplementation(async (path: string) => (path === "/v1/broker-requests" ? { requests: [] } : { requests: notes }));
    wrap(<YourReachoutsCard />);
    const section = (await screen.findByRole("heading", { name: "Your reachouts" })).closest("section")!;
    expect(within(section).getAllByRole("listitem")).toHaveLength(3);
    expect(within(section).getByRole("link", { name: "All" }).getAttribute("href")).toBe("/notifications");
    cleanup();
    apiGet.mockReset();
    apiGet.mockResolvedValue({ requests: [] });
    const { container } = wrap(<YourReachoutsCard />);
    await vi.waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
    expect(container.textContent).toBe("");
  });

  it("Your reachouts: requests we're asking around for come first, with where they stand; connected ones show as the accepted note", async () => {
    const now = new Date().toISOString();
    const req = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
      id, kind: "referral", company: `Co ${id}`, jobFunction: "product", experienceBand: null, roleTitle: null, jobUrl: null, status,
      askedCount: 6, seenCount: 2, createdAt: now, expiresAt: now, firstSeenAt: now, connectedAt: null, expiredAt: null, intentcastId: null, connection: null, ...extra,
    });
    apiGet.mockImplementation(async (path: string) =>
      path === "/v1/broker-requests"
        ? { requests: [req("a", "open"), req("b", "connected"), req("c", "expired")] }
        : { requests: [{ id: "n1", recipientFullName: "Alum 1", status: "accepted", createdAt: now }] },
    );
    wrap(<YourReachoutsCard />);
    const section = (await screen.findByRole("heading", { name: "Your reachouts" })).closest("section")!;
    const items = await within(section).findAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Referral at Co a2 have seen itAsking"),
      expect.stringContaining("Referral at Co cClosed: no one was available this timeClosed"),
      expect.stringContaining("Alum 1"),
    ]);
  });
});

describe("The Wall on Home", () => {
  const counts = (n: number) => ({ careers: 0, hiring: 0, relocation: 0, startups: 0, guidance: 0, general: n, replies: 0 });
  const rail = (n: number, onPost = vi.fn()) =>
    wrap(
      <HomeOpportunityRail
        intentcasts={Array.from({ length: n }, (_, i) => post(`p${i}`))}
        activeCategory="all"
        onCategoryChange={() => {}}
        categoryCounts={counts(n)}
        onPost={onPost}
      />,
    );

  it("has an icon header and no Post button (the tiles start posts)", () => {
    const { container } = rail(3);
    expect(screen.getByRole("heading", { name: "Opportunities for you" })).toBeTruthy();
    expect(screen.getByText("Roles, collaborations and other relevant asks from alumni.")).toBeTruthy();
    expect(container.querySelector(".home-ideal__opportunities-header .hub-card__icon svg")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Post", exact: true })).toBeNull();
  });

  it("no invite line with 1-2 posts", () => {
    rail(2);
    expect(screen.queryByText(/Every alum here can see it/)).toBeNull();
  });

  it("no invite with 3 or more posts, or on an empty Wall (it has its own prompt)", () => {
    rail(3);
    expect(screen.queryByText(/Every alum here can see it/)).toBeNull();
    cleanup();
    rail(0);
    expect(screen.queryByText(/Every alum here can see it/)).toBeNull();
  });
});
