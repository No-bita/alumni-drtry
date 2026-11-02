import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/api/client", async (orig) => ({ ...(await orig<Record<string, unknown>>()), api: { get: apiGet, post: apiPost } }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));

import { AdminCityReviewPage } from "../src/pages/AdminCityReviewPage";

const pending = [
  {
    id: "c1",
    city: "Leedsy",
    country: "United Kingdom",
    status: "pending",
    linkedMembers: 2,
    submittedByEmailMasked: "sh•••@itbhu.ac.in",
    submittedAt: "2026-10-30T10:00:00Z",
    aliases: ["leeds town"],
    rejectionReason: null,
    reviewedAt: null,
  },
];
const rejected = [
  {
    id: "c2",
    city: "Xyzzy",
    country: "India",
    status: "rejected",
    linkedMembers: 1,
    submittedByEmailMasked: null,
    submittedAt: "2026-10-29T10:00:00Z",
    aliases: [],
    rejectionReason: "Not a real city name",
    reviewedAt: "2026-10-31T10:00:00Z",
  },
];
const history = [
  { id: "h1", placeId: "c1", city: "Leedsy", country: "United Kingdom", action: "submitted", actorName: "Shah", targetCity: null, reason: null, summary: "«Leedsy» was typed by a member and is waiting for review.", at: "2026-10-30T10:00:00Z" },
];
const admin = { status: "authenticated", person: { personId: "p1", role: "admin" }, myProfile: { fullName: "Admin" } };

function answer({ off = false } = {}) {
  apiGet.mockImplementation(async (path: string) => {
    if (off) return { error: { code: "NOT_FOUND", message: "Not found." } };
    if (path.startsWith("/v1/admin/cities/review")) {
      return { data: { cities: path.includes("status=rejected") ? rejected : pending } };
    }
    if (path.startsWith("/v1/admin/cities/approved")) {
      return { data: { cities: [{ id: "a1", city: "Leeds", country: "United Kingdom" }] } };
    }
    if (path.includes("/history")) return { data: { history } };
    return { error: { code: "UNKNOWN" } };
  });
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <AdminCityReviewPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
const card = async (name: string) => (await screen.findByRole("heading", { name })).closest("li")! as HTMLElement;

beforeEach(() => {
  authState.value = admin;
  apiGet.mockReset();
  apiPost.mockReset();
  apiPost.mockResolvedValue({ data: {} });
  answer();
});
afterEach(cleanup);

describe("City review page", () => {
  it("is for admins only and loads nothing for members", () => {
    authState.value = { ...admin, person: { personId: "p2", role: "alumni" } };
    mount();
    expect(screen.getByRole("alert").textContent).toBe("This page is for admins.");
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("says so when city review is switched off", async () => {
    answer({ off: true });
    mount();
    expect(await screen.findByText(/City review is switched off/)).toBeTruthy();
  });

  it("lists waiting cities with linked members, masked submitter and other spellings; plus recent history", async () => {
    mount();
    const c = await card("Leedsy, United Kingdom");
    expect(c.textContent).toContain("2 members linked");
    expect(c.textContent).toContain("by sh•••@itbhu.ac.in");
    expect(c.textContent).toContain("Other spellings: leeds town");
    expect(await screen.findByRole("list", { name: "Recent city history" })).toBeTruthy();
  });

  it("approve can fix the name first and sends the new name", async () => {
    mount();
    const c = await card("Leedsy, United Kingdom");
    fireEvent.click(within(c).getByRole("button", { name: "Approve" }));
    const box = within(c).getByLabelText("City name") as HTMLInputElement;
    expect(box.value).toBe("Leedsy");
    fireEvent.change(box, { target: { value: "Leeds Town" } });
    fireEvent.click(within(c).getByRole("button", { name: "Yes, approve" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/admin/cities/c1/approve", { cityLabel: "Leeds Town" }));
    expect(await screen.findByText("Approved ‘Leeds Town’.")).toBeTruthy();
  });

  it("reject needs a reason of at least 3 characters", async () => {
    mount();
    const c = await card("Leedsy, United Kingdom");
    fireEvent.click(within(c).getByRole("button", { name: "Reject" }));
    const send = within(c).getByRole("button", { name: "Reject city" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(within(c).getByLabelText("Reason (required)"), { target: { value: "Typo of Leeds" } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/admin/cities/c1/reject", { reason: "Typo of Leeds" }));
  });

  it("same city as…: search approved cities, confirm, then combine", async () => {
    mount();
    const c = await card("Leedsy, United Kingdom");
    fireEvent.click(within(c).getByRole("button", { name: "Same city as…" }));
    fireEvent.click(await within(c).findByRole("button", { name: "Leeds, United Kingdom" }));
    const confirm = within(c).getByRole("group", { name: "Confirm same city as Leeds" });
    expect(confirm.textContent).toContain("Nothing is deleted");
    fireEvent.click(within(c).getByRole("button", { name: "Yes, same city" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/admin/cities/c1/same-as", { targetPlaceId: "a1" }));
  });

  it("rejected tab shows the reason and can reopen", async () => {
    mount();
    fireEvent.click(await screen.findByRole("tab", { name: "Rejected" }));
    const c = await card("Xyzzy, India");
    expect(c.textContent).toContain("Not a real city name");
    fireEvent.click(within(c).getByRole("button", { name: "Reopen" }));
    fireEvent.click(within(c).getByRole("button", { name: "Yes, reopen" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/admin/cities/c2/reopen"));
  });

  it("history opens per city", async () => {
    mount();
    const c = await card("Leedsy, United Kingdom");
    fireEvent.click(within(c).getByRole("button", { name: "History" }));
    expect(await within(c).findByRole("list", { name: "City history" })).toBeTruthy();
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/v1/admin/cities/c1/history", expect.anything()));
  });

  it("a city someone else already reviewed: says so", async () => {
    apiPost.mockResolvedValue({ error: { code: "CITY_NOT_PENDING", message: "x" } });
    mount();
    const c = await card("Leedsy, United Kingdom");
    fireEvent.click(within(c).getByRole("button", { name: "Approve" }));
    fireEvent.click(within(c).getByRole("button", { name: "Yes, approve" }));
    expect((await within(c).findByRole("alert")).textContent).toBe("Someone already reviewed this city. Refreshing the list.");
  });
});
