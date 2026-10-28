import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiGet = vi.hoisted(() => vi.fn());
const apiPatch = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/api/client", async (orig) => ({ ...(await orig<Record<string, unknown>>()), api: { get: apiGet, patch: apiPatch } }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));

import { AdminCompanyReviewPage } from "../src/pages/AdminCompanyReviewPage";

const pending = [
  { id: "o1", name: "Goldman", createdAt: "2026-10-27T12:00:00Z", createdByEmailMasked: "sh•••@itbhu.ac.in" },
  { id: "o2", name: "acme labs", createdAt: "2026-10-26T09:00:00Z", createdByEmailMasked: null },
];
const approved = [
  { id: "a1", name: "Goldman Sachs" },
  { id: "a2", name: "Google" },
];

const admin = { status: "authenticated", person: { personId: "p1", role: "admin" }, myProfile: { fullName: "Admin" } };

function answer({ pendingRows = pending, approvedRows = approved, pendingError = false } = {}) {
  apiGet.mockImplementation(async (path: string) => {
    if (path.startsWith("/v1/admin/orgs/pending")) return pendingError ? { error: { code: "BOOM", message: "nope" } } : { data: { organizations: pendingRows } };
    if (path.startsWith("/v1/admin/orgs/approved")) {
      const q = decodeURIComponent(path.split("q=")[1] ?? "").toLowerCase();
      return { data: { organizations: approvedRows.filter((o) => o.name.toLowerCase().includes(q)) } };
    }
    return { error: { code: "UNKNOWN" } };
  });
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <AdminCompanyReviewPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
const card = async (name: string) => (await screen.findByRole("heading", { name })).closest("li")! as HTMLElement;

beforeEach(() => {
  authState.value = admin;
  apiGet.mockReset();
  apiPatch.mockReset();
  apiPatch.mockResolvedValue({ data: { organization: {} } });
  answer();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Company review page", () => {
  it("is for admins only and doesn't load anything for members", () => {
    authState.value = { ...admin, person: { personId: "p2", role: "alumni" } };
    mount();
    expect(screen.getByRole("alert").textContent).toBe("This page is for admins.");
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("loads the pending names (up to 200), with when they were added and a masked creator", async () => {
    mount();
    expect(screen.getByRole("status").textContent).toContain("Loading companies");
    const c = await card("Goldman");
    expect(apiGet).toHaveBeenCalledWith("/v1/admin/orgs/pending?limit=200", expect.anything());
    expect(c.textContent).toContain("Added 27 Oct 2026 · by sh•••@itbhu.ac.in");
    expect((await card("acme labs")).textContent).not.toContain(" by ");
    expect(screen.getByText(/2 company names are waiting\. Approving or linking changes live data, and there's no undo yet\./)).toBeTruthy();
  });

  it("a load failure says so and can try again", async () => {
    answer({ pendingError: true });
    mount();
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load the companies");
    answer();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await card("Goldman")).toBeTruthy();
  });

  it("nothing pending: says so", async () => {
    answer({ pendingRows: [] });
    mount();
    expect(await screen.findByText("Nothing to review. New company names people type will appear here.")).toBeTruthy();
  });

  it("Approve company asks first (live data, no undo); Cancel changes nothing; Yes approves and removes the card", async () => {
    mount();
    const c = await card("Goldman");
    fireEvent.click(within(c).getByRole("button", { name: "Approve company" }));
    const confirm = within(c).getByRole("group", { name: "Confirm approving Goldman" });
    expect(confirm.textContent).toContain("This changes live data and there's no undo control yet.");
    expect(confirm.textContent).toContain("It becomes recognisable in Ask questions.");
    fireEvent.click(within(c).getByRole("button", { name: "Cancel" }));
    expect(apiPatch).not.toHaveBeenCalled();
    expect(within(c).getByRole("button", { name: "Approve company" })).toBeTruthy();

    fireEvent.click(within(c).getByRole("button", { name: "Approve company" }));
    fireEvent.click(within(c).getByRole("button", { name: "Yes, approve" }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledWith("/v1/admin/orgs/o1", {}));
    expect((await screen.findByText("Approved ‘Goldman’.")).getAttribute("role")).toBe("status");
    expect(screen.queryByRole("heading", { name: "Goldman" })).toBeNull();
    expect(screen.getByRole("heading", { name: "acme labs" })).toBeTruthy();
  });

  it("Same company as…: search approved companies, pick one, confirm, then link with the existing approval API", async () => {
    mount();
    const c = await card("Goldman");
    fireEvent.click(within(c).getByRole("button", { name: "Same company as…" }));
    const box = within(c).getByLabelText("Search approved companies");
    expect(await within(c).findByRole("button", { name: "Google" })).toBeTruthy();
    fireEvent.change(box, { target: { value: "gold" } });
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/v1/admin/orgs/approved?q=gold", expect.anything()));
    await waitFor(() => expect(within(c).queryByRole("button", { name: "Google" })).toBeNull());
    fireEvent.click(within(c).getByRole("button", { name: "Goldman Sachs" }));

    const confirm = within(c).getByRole("group", { name: "Confirm linking Goldman" });
    expect(confirm.textContent).toContain("Link ‘Goldman’ to ‘Goldman Sachs’?");
    expect(confirm.textContent).toContain("Asking about Goldman Sachs will also find them; asking about Goldman finds only them.");
    expect(confirm.textContent).toContain("Profiles and the directory don't change. This changes live data and there's no undo control yet.");
    // Back returns to the search without linking.
    fireEvent.click(within(c).getByRole("button", { name: "Back" }));
    expect(within(c).getByLabelText("Search approved companies")).toBeTruthy();
    expect(apiPatch).not.toHaveBeenCalled();

    fireEvent.click(await within(c).findByRole("button", { name: "Goldman Sachs" }));
    fireEvent.click(within(c).getByRole("button", { name: "Yes, link" }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledWith("/v1/admin/orgs/o1", { canonicalOrganizationId: "a1" }));
    expect(await screen.findByText("Linked ‘Goldman’ to ‘Goldman Sachs’.")).toBeTruthy();
  });

  it("no approved company matches: says so and suggests approving instead", async () => {
    mount();
    const c = await card("acme labs");
    fireEvent.click(within(c).getByRole("button", { name: "Same company as…" }));
    fireEvent.change(within(c).getByLabelText("Search approved companies"), { target: { value: "zzz" } });
    expect(await within(c).findByText("No approved company matches ‘zzz’. Approve it as its own company instead?")).toBeTruthy();
  });

  it("only one card is open at a time", async () => {
    mount();
    const g = await card("Goldman");
    const a = await card("acme labs");
    fireEvent.click(within(g).getByRole("button", { name: "Approve company" }));
    fireEvent.click(within(a).getByRole("button", { name: "Approve company" }));
    expect(within(g).queryByRole("button", { name: "Yes, approve" })).toBeNull();
    expect(within(a).getByRole("button", { name: "Yes, approve" })).toBeTruthy();
  });

  it("already reviewed by someone else: says so and refreshes the list", async () => {
    apiPatch.mockResolvedValue({ error: { code: "ORG_NOT_PENDING", message: "Organization is not pending review." } });
    mount();
    const c = await card("Goldman");
    const loadsBefore = apiGet.mock.calls.filter((x) => String(x[0]).startsWith("/v1/admin/orgs/pending")).length;
    fireEvent.click(within(c).getByRole("button", { name: "Approve company" }));
    await act(async () => {
      fireEvent.click(within(c).getByRole("button", { name: "Yes, approve" }));
    });
    expect((await within(c).findByRole("alert")).textContent).toBe("Already reviewed. Refreshing the list.");
    await waitFor(() =>
      expect(apiGet.mock.calls.filter((x) => String(x[0]).startsWith("/v1/admin/orgs/pending")).length).toBeGreaterThan(loadsBefore),
    );
  });
});
