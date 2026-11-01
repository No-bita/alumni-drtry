import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PendingCompany } from "../src/lib/adminCompanies";

const fns = vi.hoisted(() => ({
  fetchPendingCompanies: vi.fn(),
  fetchApprovedList: vi.fn(),
  searchApprovedCompanies: vi.fn(),
  reviewCompany: vi.fn(),
  renameCompany: vi.fn(),
  linkApprovedCompany: vi.fn(),
  rejectCompany: vi.fn(),
}));
vi.mock("../src/lib/adminCompanies", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/adminCompanies")>();
  return {
    ...actual,
    fetchPendingCompanies: fns.fetchPendingCompanies,
    fetchApprovedList: fns.fetchApprovedList,
    searchApprovedCompanies: fns.searchApprovedCompanies,
    reviewCompany: fns.reviewCompany,
    renameCompany: fns.renameCompany,
    linkApprovedCompany: fns.linkApprovedCompany,
    rejectCompany: fns.rejectCompany,
  };
});
const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));

import { AdminCompanyReviewPage } from "../src/pages/AdminCompanyReviewPage";

const pendingRow: PendingCompany = {
  id: "org-1",
  name: "Acme Dynacorp",
  createdAt: "2026-10-29T00:00:00.000Z",
  createdByEmailMasked: "fi•••@itbhu.ac.in",
  createdByEmail: "firstname.lastname@itbhu.ac.in",
  submittedName: null,
};

function mount(pending: PendingCompany[] = [pendingRow], approved: unknown[] = []) {
  authState.value = {
    status: "authenticated",
    person: { personId: "admin-1", institutionalEmail: "admin@iitbhu.ac.in", role: "admin" },
    myProfile: { id: "admin-1", fullName: "Admin" },
  };
  fns.fetchPendingCompanies.mockResolvedValue(pending);
  fns.fetchApprovedList.mockResolvedValue(approved);
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <AdminCompanyReviewPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminCompanyReviewPage reject flow", () => {
  it("shows the submitter's full email on a pending card", async () => {
    mount();
    expect(await screen.findByText(/firstname\.lastname@itbhu\.ac\.in/)).toBeTruthy();
  });

  it("rejects with a reason and removes the card", async () => {
    fns.rejectCompany.mockResolvedValue(undefined);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));

    const confirm = await screen.findByRole("button", { name: "Yes, reject" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Can't verify this company" } });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);

    await waitFor(() => expect(fns.rejectCompany).toHaveBeenCalledWith("org-1", "Can't verify this company"));
    expect((await screen.findByText(/Rejected ‘Acme Dynacorp’/)).textContent).toContain("Rejected ‘Acme Dynacorp’");
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  });

  it("no Reject action on approved companies", async () => {
    mount([], [{ id: "org-9", name: "Real Co", submittedName: null, linkedTo: null, linkedNames: 0 }]);
    expect(await screen.findByText("Real Co")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
  });
});
