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

import { AdminLocationCleanup } from "../src/pages/AdminLocationCleanup";
import { parseSpellings, suggestCityName } from "../src/lib/adminLocations";

const admin = { status: "authenticated", person: { personId: "p1", role: "admin" }, myProfile: { fullName: "Admin" } };

const inbox = {
  suggestedMerges: [],
  unmappedClusters: [
    {
      displayCity: "bangalore",
      displayCountry: "India",
      normCountry: "india",
      normCity: "bangalore",
      profiles: 25,
      lastSeenAt: "2026-11-01T10:00:00Z",
      suggestedCityLabel: "Gurugram",
      suggestedCountryLabel: "India",
      suggestedTreatAsCityId: "g1",
      suggestionConfidence: null,
    },
    {
      displayCity: "gurgaon",
      displayCountry: "India",
      normCountry: "india",
      normCity: "gurgaon",
      profiles: 5,
      lastSeenAt: null,
      suggestedCityLabel: "Gurugram",
      suggestedCountryLabel: "India",
      suggestedTreatAsCityId: "g1",
      suggestionConfidence: "medium",
    },
  ],
  recentActivity: [{ summary: "Created «Pune». Linked 13 members.", at: "2026-11-02T10:00:00Z" }],
  approvedCities: [{ id: "g1", city: "Gurugram", country: "India", linkedMembers: 7 }],
};

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={["/admin/locations"]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/admin/locations" element={<AdminLocationCleanup />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
const card = async (name: string) => (await screen.findByRole("heading", { name })).closest("li")! as HTMLElement;

beforeEach(() => {
  authState.value = admin;
  apiGet.mockReset();
  apiPost.mockReset();
  apiGet.mockImplementation(async (path: string) => {
    if (path.startsWith("/v1/admin/locations/cleanup/inbox")) return { data: inbox };
    if (path.startsWith("/v1/admin/places")) return { data: { places: [{ id: "g1", city_label: "Gurugram", country: "India" }] } };
    return { error: { code: "UNKNOWN" } };
  });
});
afterEach(() => cleanup());

describe("Location cleanup", () => {
  it("is for admins only", () => {
    authState.value = { ...admin, person: { personId: "p2", role: "alumni" } };
    mount();
    expect(screen.getByRole("alert").textContent).toBe("This page is for admins.");
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("lists typed cities with how many members wait, the cities and recent changes", async () => {
    mount();
    const c = await card("bangalore, India");
    expect(c.textContent).toContain("25 members typed this");
    // A nearest city with no confidence isn't offered as a suggestion.
    expect(within(c).queryByRole("button", { name: "Same as Gurugram" })).toBeNull();
    expect(within(await card("gurgaon, India")).getByText("Might be Gurugram.")).toBeTruthy();
    expect(screen.getByText(/30 members are waiting\./)).toBeTruthy();
    const cities = screen.getByRole("list", { name: "Cities" });
    expect(within(cities).getByRole("link", { name: /Gurugram, India/ }).getAttribute("href")).toBe("/admin/locations/places/g1");
    expect(screen.getByText("Created «Pune». Linked 13 members.")).toBeTruthy();
  });

  it("Create city: a proper name and spellings, then 'Linked N members'", async () => {
    apiPost.mockResolvedValue({ data: { profilesUpdated: 53, cityLabel: "Bengaluru", country: "India", placeId: "b1" } });
    mount();
    const c = await card("bangalore, India");
    fireEvent.click(within(c).getByRole("button", { name: "Create city" }));
    const name = within(c).getByLabelText("City name") as HTMLInputElement;
    expect(name.value).toBe("Bangalore");
    fireEvent.change(name, { target: { value: "Bengaluru" } });
    fireEvent.change(within(c).getByLabelText(/Other spellings/), { target: { value: "Banglore, BLR, blr" } });
    expect(within(c).getByRole("form").textContent).toContain("‘bangalore’ is kept as a spelling");
    fireEvent.click(within(c).getByRole("button", { name: "Create and link" }));
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/v1/admin/locations/cleanup/actions/create-city-from-text", {
        displayCountry: "India",
        displayCity: "bangalore",
        cityLabel: "Bengaluru",
        extraSpellings: ["Banglore", "BLR"],
      }),
    );
    expect((await screen.findByText("Created Bengaluru, India. Linked 53 members.")).getAttribute("role")).toBe("status");
  });

  it("Same as the suggested city asks first, then links and saves the spelling", async () => {
    apiPost.mockResolvedValue({ data: { profilesUpdated: 5 } });
    mount();
    const c = await card("gurgaon, India");
    fireEvent.click(within(c).getByRole("button", { name: "Same as Gurugram" }));
    expect(within(c).getByRole("group").textContent).toContain("is saved as a spelling");
    fireEvent.click(within(c).getByRole("button", { name: "Yes, link" }));
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/v1/admin/locations/cleanup/actions/map-free-text-to-city", {
        displayCountry: "India",
        displayCity: "gurgaon",
        treatAsCityId: "g1",
      }),
    );
    expect(await screen.findByText("Saved ‘gurgaon’ as a spelling of Gurugram. Linked 5 members.")).toBeTruthy();
  });

  it("Same city as… searches approved cities", async () => {
    mount();
    const c = await card("bangalore, India");
    fireEvent.click(within(c).getByRole("button", { name: "Same city as…" }));
    fireEvent.change(within(c).getByLabelText("Search cities"), { target: { value: "gur" } });
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith("/v1/admin/places?q=gur&limit=12", expect.anything()));
    fireEvent.click(await within(c).findByRole("button", { name: /Gurugram/ }));
    expect(within(c).getByRole("group", { name: "Confirm bangalore is Gurugram" })).toBeTruthy();
  });

  it("an existing city name explains what to do instead", async () => {
    apiPost.mockResolvedValue({ error: { code: "CANONICAL_PLACE_EXISTS", message: "exists" } });
    mount();
    const c = await card("bangalore, India");
    fireEvent.click(within(c).getByRole("button", { name: "Create city" }));
    fireEvent.click(within(c).getByRole("button", { name: "Create and link" }));
    expect((await within(c).findByRole("alert")).textContent).toContain("Use “Same city as…”");
  });

  it("Add a city sends the name, country and spellings", async () => {
    apiPost.mockResolvedValue({ data: { placeId: "m1", cityLabel: "Mumbai", country: "India", linkedMembers: 7 } });
    mount();
    const form = await screen.findByRole("form", { name: "Add a city" });
    fireEvent.change(within(form).getByLabelText("City name"), { target: { value: "Mumbai" } });
    fireEvent.change(within(form).getByLabelText(/Other spellings/), { target: { value: "Bombay" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add city" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/admin/locations/cities", { country: "India", cityLabel: "Mumbai", spellings: ["Bombay"] }));
    expect(await screen.findByText("Added Mumbai, India. Linked 7 members.")).toBeTruthy();
  });

  it("load failure says so", async () => {
    apiGet.mockResolvedValue({ error: { code: "BOOM", message: "nope" } });
    mount();
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't load Location cleanup.");
  });
});

describe("helpers", () => {
  it("suggestCityName and parseSpellings", () => {
    expect(suggestCityName("  NEW   delhi ")).toBe("New Delhi");
    expect(suggestCityName("bangalore")).toBe("Bangalore");
    expect(parseSpellings("blr, BLR , , Banglore")).toEqual(["blr", "Banglore"]);
  });
});
