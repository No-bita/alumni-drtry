import { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const post = vi.hoisted(() => vi.fn());
const get = vi.hoisted(() => vi.fn(async () => ({ data: { count: 4 } })));
const getJson = vi.hoisted(() => vi.fn());
const bulletinOpen = vi.hoisted(() => vi.fn());

vi.mock("../src/api/client", () => ({ api: { post, get } }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: getJson }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({ status: "authenticated", myProfile: { fullName: "Viewer Person" } }),
}));
vi.mock("../src/components/PostBulletinFlow", () => ({
  PostBulletinFlow: forwardRef(function MockFlow(_props, ref) {
    useImperativeHandle(ref, () => ({ open: bulletinOpen, close: vi.fn() }));
    return null;
  }),
}));

import { AskMode } from "../src/pages/AskMode";

const intent = { category: "hiring", company: "Acme", role: "Product Manager", fromRole: null, city: null, country: null, studyPrograms: [], keywords: [], source: "rules" };
const candidate = {
  id: "11111111-1111-1111-1111-111111111111", fullName: "Ananya Rao", batchYear: 2016, departmentCode: "eee", departmentName: "Electrical Engineering",
  headlineRoleTitle: "Product Manager", headlineOrganizationName: "Swiggy", residenceCity: "Bengaluru", residenceCountry: "India",
  whyThem: "Currently Product Manager at Swiggy", reasons: [{ key: "current_role", text: "Currently Product Manager at Swiggy" }], openTo: [], relevantOpenTo: [],
};

function mount(url = "/search?ask=we+are+hiring+a+PM") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/search" element={<AskMode />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  post.mockReset();
  getJson.mockReset();
  getJson.mockResolvedValue({ occupations: [] });
  bulletinOpen.mockReset();
});
afterEach(cleanup);

describe("Ask: hiring", () => {
  it("offers three choices instead of a people list; recommending is coming soon", async () => {
    post.mockResolvedValue({ data: { intent, needsDetail: false, results: [candidate], fallback: null } });
    mount();
    expect(await screen.findByRole("heading", { name: "Looks like you're hiring for a Product Manager role. What would you like to do?" })).toBeTruthy();
    expect(screen.queryByText("Ananya Rao")).toBeNull();
    expect(screen.getByRole("button", { name: /Share the role/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Find candidates/ })).toBeTruthy();
    expect((screen.getByRole("button", { name: /Ask alumni to recommend people/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Share the role opens the composer at Hiring, filled in from the question", async () => {
    post.mockResolvedValue({ data: { intent, needsDetail: false, results: [], fallback: "post_bulletin" } });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Share the role/ }));
    expect(bulletinOpen).toHaveBeenCalledWith({ category: "hiring", hiring: { jobFunction: "product", roleTitle: "Product Manager", company: "Acme" } });
  });

  it("Find candidates lists alumni who do the role; Reach out sends a Hiring note", async () => {
    post.mockImplementation(async (path: string) =>
      path === "/v1/match" ? { data: { intent, needsDetail: false, results: [candidate], fallback: null } } : { data: { contactRequest: { id: "x" } } },
    );
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Find candidates/ }));
    expect(screen.getByText("1 alum who does this role")).toBeTruthy();
    expect(screen.getByText("Ananya Rao", { selector: "a" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Reach out/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText("Topic")).toBeNull();
    expect((within(dialog).getByLabelText("Role") as HTMLInputElement).value).toBe("Product Manager");
    expect((within(dialog).getByLabelText("Company") as HTMLInputElement).value).toBe("Acme");
    const message = "Small product team at Acme; you'd own onboarding end to end. Your work at Swiggy looks like a great fit.";
    fireEvent.change(within(dialog).getByLabelText("Your message"), { target: { value: message } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Preview" }));
    expect(within(dialog).getByText("Hiring")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/v1/contact-requests", {
        recipientPersonId: candidate.id,
        note: { purpose: "hiring", role: "Product Manager", company: "Acme", message, jobUrl: null },
        source: "match",
        sourceRank: 1,
      }),
    );
  });

  it("Ask them privately: taps, then a private hiring request with no Wall post", async () => {
    post.mockImplementation(async (path: string) =>
      path === "/v1/match"
        ? { data: { intent, needsDetail: false, results: [candidate], fallback: null } }
        : { data: { request: { id: "r1", kind: "hiring", company: "Acme", jobFunction: "product", experienceBand: "0_3", roleTitle: "Product Manager", jobUrl: null, status: "open", askedCount: 4, seenCount: 0, createdAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-03T00:00:00Z", firstSeenAt: null, connectedAt: null, expiredAt: null, intentcastId: null, connection: null } } },
    );
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Find candidates/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ask them privately if they're interested" }));
    const dialog = await screen.findByRole("dialog", { name: "Ask matching alumni privately" });
    expect(within(dialog).getByRole("radio", { name: "Product" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(dialog).getByRole("radio", { name: "0–3 yrs" }));
    expect(await within(dialog).findByText("We'll ask 4 alumni.")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/^Details/), { target: { value: "Own onboarding end to end." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ask privately" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/v1/broker-requests", {
        kind: "hiring",
        role: { jobFunction: "product", experience: "0_3", roleTitle: "Product Manager", company: "Acme", message: "Own onboarding end to end." },
      }),
    );
    expect(await within(dialog).findByText(/privately asked 4 alumni/)).toBeTruthy();
  });

  it("no role named: asks what role first", async () => {
    post.mockResolvedValue({ data: { intent: { ...intent, role: null }, needsDetail: true, results: [], fallback: null } });
    mount("/search?ask=hiring+interns");
    expect(await screen.findByText("What role are you hiring for?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Find candidates/ })).toBeNull();
  });
});
