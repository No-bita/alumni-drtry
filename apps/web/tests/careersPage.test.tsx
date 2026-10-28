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
vi.mock("../src/components/CareerIntentFeedRows", () => ({ CareerIntentFeedRows: () => <p>Existing feed and filters</p> }));
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
    myProfile: { id: "me1", fullName: "Me", openToPreferences: { selected: w.openTo ?? [], descriptions: {} } },
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
  it("a brand-new member: search first, topics, and only the sections that have something (plus the hiring invite)", async () => {
    world();
    mount();
    expect(screen.getByRole("heading", { name: "Get referred where you're applying." })).toBeTruthy();
    expect(await screen.findByText(/No alumni have said they're open to referrals yet/)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Your asks" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "You can help" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Recent from alumni" })).toBeNull();
    expect(screen.getByText("Hiring? Post a role and alumni will see it here.")).toBeTruthy();
    for (const link of screen.getAllByRole("link", { name: "Browse all alumni" })) expect(link.getAttribute("href")).toBe("/search");
  });

  it("company search: needs a name, then opens the company screen with the role", async () => {
    world();
    mount();
    const find = screen.getByRole("button", { name: "Find alumni" }) as HTMLButtonElement;
    expect(find.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Where are you applying?"), { target: { value: "Razorpay" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Product manager"), { target: { value: "Product manager" } });
    fireEvent.click(find);
    expect((await screen.findByTestId("where")).textContent).toBe("/intent/career/company?name=Razorpay&role=Product+manager");
  });

  it("topic shortcuts open Ask with the topic chosen", () => {
    world();
    mount();
    expect(screen.getByRole("link", { name: "Interview prep" }).getAttribute("href")).toBe("/match?cat=interview_prep");
    expect(screen.getByRole("link", { name: "Explore a switch" }).getAttribute("href")).toBe("/match?cat=career_switch");
    expect(screen.getByRole("link", { name: "Higher studies" }).getAttribute("href")).toBe("/match?cat=higher_studies");
    expect(screen.getByRole("link", { name: "Moving cities" }).getAttribute("href")).toBe("/match?cat=relocation");
  });

  it("companies you can get referred to: five, then See all; each opens its company screen", async () => {
    world({ companies: Array.from({ length: 7 }, (_, i) => ({ company: `Co ${i}`, alumni: 7 - i })) });
    mount();
    const first = await screen.findByRole("link", { name: /Co 0/ });
    expect(first.getAttribute("href")).toBe("/intent/career/company?name=Co+0");
    expect(first.textContent).toContain("7 alumni");
    expect(screen.queryByRole("link", { name: /Co 6/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "See all 7 companies" }));
    expect(screen.getByRole("link", { name: /Co 6/ }).textContent).toContain("1 alum");
  });

  it("your asks: the latest three with status, going to Notifications", async () => {
    const now = new Date().toISOString();
    world({ sent: [1, 2, 3, 4].map((i) => ({ id: `n${i}`, recipientFullName: `Alum ${i}`, status: i === 1 ? "accepted" : "pending", createdAt: now })) });
    mount();
    const section = (await screen.findByRole("heading", { name: "Your asks" })).closest("section")!;
    const rows = within(section).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(section).getByRole("link", { name: "All" }).getAttribute("href")).toBe("/notifications");
    expect(rows[0]!.querySelector("a")!.getAttribute("href")).toBe("/notifications");
  });

  it("you can help: asks waiting, demand for your company, and Offer help to your Open-to settings", async () => {
    world({ openTo: ["referrals"], inbox: 2, demand: { company: "Razorpay", asks: 4, days: 30 } });
    mount();
    const section = (await screen.findByRole("heading", { name: "You can help" })).closest("section")!;
    expect(within(section).getByRole("link", { name: /Asks waiting for you/ }).getAttribute("href")).toBe("/notifications");
    expect(await within(section).findByText("4 asks about Razorpay in the last 30 days")).toBeTruthy();
    expect(within(section).getByText("You're open to referrals, so you can show up for them.")).toBeTruthy();
    expect(within(section).getByRole("link", { name: "Offer help: update what you're open to" }).getAttribute("href")).toBe("/profiles/me1?edit=open-to");
  });

  it("roles and recent posts from alumni; Post a role opens the role form; See all shows the full feed", async () => {
    const role = post("r1", "hiring", "Backend Engineer\n\nJoin our team");
    const ask = post("m1", "mentorship", "Advice on switching to product\n\nLooking for 20 minutes");
    world({ posts: [role, ask] });
    mount();
    const roles = (await screen.findByRole("heading", { name: "Roles from alumni" })).closest("section")!;
    expect(await within(roles).findByText(mapIntentcastToRow(role)!.roleHeader)).toBeTruthy();
    fireEvent.click(within(roles).getByRole("button", { name: "Post a role" }));
    expect(flows.hiring).toHaveBeenCalledOnce();
    const recent = screen.getByRole("heading", { name: "Recent from alumni" }).closest("section")!;
    expect(within(recent).getByText(mapIntentcastToRow(ask)!.roleHeader)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "All posts from alumni" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "See all posts from alumni" }));
    expect(within(screen.getByRole("region", { name: "All posts from alumni" })).getByText("Existing feed and filters")).toBeTruthy();
  });
});
