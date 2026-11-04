import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/api/client", async (orig) => ({ ...(await orig<Record<string, unknown>>()), api: { get: apiGet, post: apiPost } }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));

import { AdminPlaceDetail } from "../src/pages/AdminPlaceDetail";

const admin = { status: "authenticated", person: { personId: "p1", role: "admin" }, myProfile: { fullName: "Admin" } };
const detail = {
  place: { id: "b1", displayCountry: "India", displayCity: "Bengaluru", status: "approved", combinedIntoPlaceId: null },
  aliases: ["bengaluru", "bangalore"],
  linkedProfiles: 50,
  recentNotes: [{ summary: "Approved «Bengaluru». Linked 53 members.", at: "2026-11-02T10:00:00Z" }],
};

function mount(path = "/admin/locations/places/b1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/admin/locations/places/:placeId" element={<AdminPlaceDetail />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.value = admin;
  apiGet.mockReset();
  apiPost.mockReset();
  apiGet.mockImplementation(async (path: string) => {
    if (path === "/v1/admin/locations/places/b1") return { data: detail };
    if (path.startsWith("/v1/admin/places")) {
      return { data: { places: [{ id: "b1", city_label: "Bengaluru", country: "India" }, { id: "x2", city_label: "Bangalore", country: "India" }] } };
    }
    return { error: { code: "UNKNOWN" } };
  });
});
afterEach(() => cleanup());

describe("Location cleanup: one city", () => {
  it("shows the city, its spellings and history", async () => {
    mount();
    expect(await screen.findByRole("heading", { name: "Bengaluru, India" })).toBeTruthy();
    expect(screen.getByText(/Approved · 50 members/)).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Saved spellings" })).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Approved «Bengaluru». Linked 53 members.")).toBeTruthy();
  });

  it("adding a spelling reports who was linked", async () => {
    apiPost.mockResolvedValue({ data: { linkedMembers: 3 } });
    mount();
    const form = await screen.findByRole("form", { name: "Add a spelling" });
    fireEvent.change(within(form).getByLabelText("Add a spelling people type"), { target: { value: "BLR" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add spelling" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/admin/locations/places/b1/spelling-alias", { spelling: "BLR" }));
    expect(await screen.findByText("Saved ‘BLR’. Linked 3 members.")).toBeTruthy();
  });

  it("rename keeps typed text and says so", async () => {
    apiPost.mockResolvedValue({ data: { linkedMembers: 0 } });
    mount();
    const form = await screen.findByRole("form", { name: "Rename the city" });
    expect(form.textContent).toContain("typed text isn't changed");
    fireEvent.change(within(form).getByLabelText("City name"), { target: { value: "Bengaluru City" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/admin/locations/places/b1/rename-display-city", { displayCity: "Bengaluru City" }));
  });

  it("combine: pick a duplicate (never itself), confirm, then it's combined", async () => {
    apiPost.mockResolvedValue({ data: { linkedMembers: 2 } });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Find the duplicate…" }));
    fireEvent.change(screen.getByLabelText("Search cities"), { target: { value: "bang" } });
    const pick = await screen.findByRole("button", { name: /Bangalore/ });
    expect(screen.queryByRole("button", { name: /^Bengaluru/ })).toBeNull();
    fireEvent.click(pick);
    expect(screen.getByRole("group", { name: "Confirm combining Bangalore" }).textContent).toContain("Nothing is deleted");
    fireEvent.click(screen.getByRole("button", { name: "Yes, combine" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/admin/locations/places/b1/combine-with-city", { combineCityId: "x2" }));
    expect(await screen.findByText("Combined Bangalore into Bengaluru. Linked 2 members.")).toBeTruthy();
  });

  it("hide: needs a reason, states what happens, then hides", async () => {
    apiPost.mockResolvedValue({ data: {} });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Hide city…" }));
    const form = screen.getByRole("form", { name: "Hide Bengaluru" });
    expect(form.textContent).toContain("Nothing is deleted");
    expect(form.textContent).toContain("restored from the review queue");
    const confirm = within(form).getByRole("button", { name: "Hide city" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText("Reason"), { target: { value: "Not a real place" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/admin/cities/b1/reject", { reason: "Not a real place" }));
    expect(await screen.findByText(/Hidden\. 50 linked members stay linked/)).toBeTruthy();
  });

  it("a hidden (rejected) city has no Hide action", async () => {
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/v1/admin/locations/places/b1") return { data: { ...detail, place: { ...detail.place, status: "rejected" } } };
      return { error: { code: "UNKNOWN" } };
    });
    mount();
    expect(await screen.findByText(/Rejected · 50 members/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Hide city…" })).toBeNull();
  });

  it("non-admins don't load anything", () => {
    authState.value = { ...admin, person: { personId: "p2", role: "alumni" } };
    mount();
    expect(screen.getByRole("alert").textContent).toBe("This page is for admins.");
    expect(apiGet).not.toHaveBeenCalled();
  });
});
