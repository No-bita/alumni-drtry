import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { IntentcastFeedItem } from "../src/api/client";

const flows = vi.hoisted(() => ({ hiring: vi.fn() }));
const apiGet = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: apiGet }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));
vi.mock("../src/components/PostRoleHiringFlow", async () => {
  const { useImperativeHandle } = await import("react");
  return { PostRoleHiringFlow: ({ ref }: { ref: import("react").Ref<{ open: () => void }> }) => { useImperativeHandle(ref, () => ({ open: flows.hiring })); return null; } };
});

import { CareerPage } from "../src/pages/CareerPage";
import { mapIntentcastToRow } from "../src/lib/careerFeedRow";

const post = (id: string, category: IntentcastFeedItem["category"], content: string): IntentcastFeedItem =>
  ({
    id, authorPersonId: `a-${id}`, authorFullName: `Author ${id}`, authorDepartmentCode: "cse", authorDepartmentName: "CSE", authorBatchYear: 2019,
    category, content, status: "open", expiresAt: "2099-01-01", closedAt: null, createdAt: new Date().toISOString(), editableUntil: "2099-01-01", responseCount: 0,
  }) as IntentcastFeedItem;

type World = {
  companies?: Array<{ company: string; alumni: number }>;
  sent?: Array<{ id: string; recipientFullName: string; status: string; createdAt: string }>;
  inbox?: number;
  demand?: { company: string; asks: number; days: number } | null;
  posts?: IntentcastFeedItem[];
  openTo?: string[];
};

function world(w: World = {}) {
  authState.value = {
    status: "authenticated",
    person: { personId: "p1", institutionalEmail: "a@iitbhu.ac.in", role: "alumni" },
    myProfile: { id: "me1", fullName: "Me", openToPreferences: { selected: w.openTo ?? [] } },
  };
  apiGet.mockImplementation(async (path: string) => {
    if (path === "/v1/careers/referral-companies") return { companies: w.companies ?? [] };
    if (path === "/v1/contact-requests/sent") return { requests: (w.sent ?? []).map((n) => ({ recipientPersonId: "r", message: "m", recipientContactShared: null, respondedAt: null, ...n })) };
    if (path === "/v1/contact-requests/inbox") return { requests: Array.from({ length: w.inbox ?? 0 }, (_, i) => ({ id: `i${i}` })) };
    if (path === "/v1/careers/my-company-demand") return { demand: w.demand ?? null };
    if (path.startsWith("/v1/intentcasts")) return { intentcasts: w.posts ?? [] };
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
    <MemoryRouter initialEntries={["/intent/career"]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/intent/career" element={<CareerPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  apiGet.mockReset();
  flows.hiring.mockReset();
});
afterEach(cleanup);

describe("Careers page", () => {
  it("a brand-new member: title, search, shortcuts, the hiring invite and quick links; empty sections stay hidden", async () => {
    world();
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Careers" })).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Search careers" })).toBeTruthy();
    expect(await screen.findByText("Hiring? Post a role and alumni will see it here.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Your reachouts" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Reachouts waiting for you" })).toBeNull();
    for (const gone of ["Your asks", "You can help", "Asks waiting for you", "Recent from alumni", "Roles from alumni", "Get referred where you're applying."]) {
      expect(screen.queryByRole("heading", { name: gone })).toBeNull();
    }
    const links = screen.getByRole("heading", { name: "Quick links" }).closest("section")!;
    expect(within(links).getByRole("link", { name: "Browse all alumni" }).getAttribute("href")).toBe("/search");
    fireEvent.click(within(links).getByRole("button", { name: "Companies you can get referred to" }));
    expect(await within(links).findByText(/No alumni have said they're open to referrals yet/)).toBeTruthy();
  });

  it("search: needs 3 characters, then opens Ask with the question filled in", async () => {
    world();
    mount();
    const go = screen.getByRole("button", { name: "Search" }) as HTMLButtonElement;
    const box = screen.getByRole("searchbox", { name: "Search careers" });
    fireEvent.change(box, { target: { value: "PM" } });
    expect(go.disabled).toBe(true);
    fireEvent.change(box, { target: { value: "Referral for PM at Razorpay" } });
    expect(go.disabled).toBe(false);
    fireEvent.click(go);
    expect((await screen.findByTestId("where")).textContent).toBe("/match?q=Referral%20for%20PM%20at%20Razorpay");
  });

  it("shortcuts open Ask on their topic; career advice opens Ask with nothing chosen; Moving cities is gone", () => {
    world();
    mount();
    const nav = screen.getByRole("navigation", { name: "What do you need help with?" });
    expect(within(nav).getByRole("link", { name: "Get a referral" }).getAttribute("href")).toBe("/match?cat=referral");
    expect(within(nav).getByRole("link", { name: "Prepare for interviews" }).getAttribute("href")).toBe("/match?cat=interview_prep");
    expect(within(nav).getByRole("link", { name: "Explore a switch" }).getAttribute("href")).toBe("/match?cat=career_switch");
    expect(within(nav).getByRole("link", { name: "Higher studies" }).getAttribute("href")).toBe("/match?cat=higher_studies");
    expect(within(nav).getByRole("link", { name: "Get career advice" }).getAttribute("href")).toBe("/match");
    expect(screen.queryByRole("link", { name: "Moving cities" })).toBeNull();
  });

  it("companies you can get referred to: a quick link that opens the list; five, then See all; each opens its company screen", async () => {
    world({ companies: Array.from({ length: 7 }, (_, i) => ({ company: `Co ${i}`, alumni: 7 - i })) });
    mount();
    const toggle = screen.getByRole("button", { name: "Companies you can get referred to" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const first = await screen.findByRole("link", { name: /Co 0/ });
    expect(first.getAttribute("href")).toBe("/intent/career/company?name=Co+0");
    expect(first.textContent).toContain("7 alumni");
    expect(screen.queryByRole("link", { name: /Co 6/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "See all 7 companies" }));
    expect(screen.getByRole("link", { name: /Co 6/ }).textContent).toContain("1 alum");
  });

  it("your reachouts: the latest three with status, going to Notifications", async () => {
    const now = new Date().toISOString();
    world({ sent: [1, 2, 3, 4].map((i) => ({ id: `n${i}`, recipientFullName: `Alum ${i}`, status: i === 1 ? "accepted" : "pending", createdAt: now })) });
    mount();
    const section = (await screen.findByRole("heading", { name: "Your reachouts" })).closest("section")!;
    const rows = within(section).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(section).getByText("Accepted")).toBeTruthy();
    expect(within(section).getByRole("link", { name: "All" }).getAttribute("href")).toBe("/notifications");
    expect(rows[0]!.querySelector("a")!.getAttribute("href")).toBe("/notifications");
  });

  it("reachouts waiting for you: count, searches for your company, and Offer help to your Open-to settings", async () => {
    world({ openTo: ["referrals"], inbox: 2, demand: { company: "Razorpay", asks: 4, days: 30 } });
    mount();
    const section = (await screen.findByRole("heading", { name: "Reachouts waiting for you" })).closest("section")!;
    expect((await within(section).findByRole("link", { name: "2 waiting for your reply" })).getAttribute("href")).toBe("/notifications");
    expect(await within(section).findByText("4 searches for Razorpay in the last 30 days")).toBeTruthy();
    expect(within(section).getByText("You're open to referrals, so you can show up in those searches.")).toBeTruthy();
    expect(within(section).getByRole("link", { name: "Offer help: update what you're open to" }).getAttribute("href")).toBe("/profiles/me1?edit=open-to");
    expect(section.textContent).not.toMatch(/\basks?\b/i);
  });

  it("reachouts waiting for you: shows 0 when nothing waits but you work somewhere", async () => {
    world({ inbox: 0, demand: { company: "Razorpay", asks: 1, days: 30 } });
    mount();
    const section = (await screen.findByRole("heading", { name: "Reachouts waiting for you" })).closest("section")!;
    expect(await within(section).findByRole("link", { name: "0 waiting for your reply" })).toBeTruthy();
    expect(within(section).getByText("1 search for Razorpay in the last 30 days")).toBeTruthy();
    expect(within(section).getByText("Say you're open to referrals to show up in those searches.")).toBeTruthy();
  });

  it("opportunities: roles alumni posted (hiring only), four then View all jobs; Post a role opens the role form", async () => {
    const roles = Array.from({ length: 6 }, (_, i) => post(`r${i}`, "hiring", `Backend Engineer ${i}\n\nJoin our team`));
    world({ posts: roles });
    mount();
    const section = (await screen.findByRole("heading", { name: "Opportunities for you" })).closest("section")!;
    expect(await within(section).findByText(mapIntentcastToRow(roles[0]!)!.roleHeader)).toBeTruthy();
    expect(apiGet.mock.calls.some(([p]) => String(p).includes("category=hiring"))).toBe(true);
    expect(within(section).getAllByRole("listitem")).toHaveLength(4);
    const first = within(section).getAllByRole("listitem")[0]!.querySelector("a")!;
    expect(first.getAttribute("href")).toBe("/profiles/a-r0");
    expect(first.textContent).toContain("Posted by Author r0");
    // Each role can be shared; the button sits beside the row link (not inside it).
    const share = within(section).getAllByRole("button", { name: "Share this post" });
    expect(share).toHaveLength(4);
    expect(share[0]!.closest("a")).toBeNull();
    fireEvent.click(within(section).getByRole("button", { name: "View all jobs (6)" }));
    expect(within(section).getAllByRole("listitem")).toHaveLength(6);
    fireEvent.click(within(section).getByRole("button", { name: "Post a role" }));
    expect(flows.hiring).toHaveBeenCalledOnce();
    const links = screen.getByRole("heading", { name: "Quick links" }).closest("section")!;
    fireEvent.click(within(links).getByRole("button", { name: "Post a role" }));
    expect(flows.hiring).toHaveBeenCalledTimes(2);
  });
});
