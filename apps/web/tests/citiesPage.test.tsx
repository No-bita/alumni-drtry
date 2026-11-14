import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CityAlum, CityPayload, CityPerson, CitiesList, CityRef } from "../src/lib/cities";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const apiPatch = vi.hoisted(() => vi.fn());
const apiDelete = vi.hoisted(() => vi.fn());
const wallOpen = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: apiGet }));
vi.mock("../src/components/Nav", () => ({ Nav: ({ appToolbarLead }: { appToolbarLead?: React.ReactNode }) => <nav>{appToolbarLead}</nav> }));
vi.mock("../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api/client")>()),
  api: { get: vi.fn(), post: apiPost, patch: apiPatch, delete: apiDelete },
}));
vi.mock("../src/components/PostBulletinFlow", async () => {
  const { useImperativeHandle } = await import("react");
  return {
    PostBulletinFlow: ({ ref }: { ref: import("react").Ref<{ open: (o: unknown) => void; close: () => void }> }) => {
      useImperativeHandle(ref, () => ({ open: wallOpen, close: () => {} }));
      return null;
    },
  };
});

import { LocationPage } from "../src/pages/LocationPage";

const BLR: CityRef = { placeId: "blr", city: "Bengaluru", country: "India", slug: "bengaluru" };
const PUNE: CityRef = { placeId: "pune", city: "Pune", country: "India", slug: "pune" };

const person = (id: string, fullName: string, extra: Partial<CityPerson> = {}): CityPerson => ({
  id,
  fullName,
  batchYear: 2016,
  departmentCode: "cse",
  departmentName: "Computer Science",
  roleTitle: "Engineer",
  organizationName: "Acme",
  ...extra,
});
const closed = { open: false, limit: null, spotsLeft: null, askedByMe: false };
const alum = (p: CityPerson, coffee: CityAlum["coffee"], sharedTag: string | null = "Same batch"): CityAlum => ({ person: p, sharedTag, coffee });

function payload(over: Partial<CityPayload> = {}): CityPayload {
  return {
    place: BLR,
    viewerRole: "local",
    viewerCity: BLR,
    v1Enabled: true,
    counts: { alumni: 41, openToCityHelp: 6 },
    arrivalPrompt: false,
    arrivals: { total: 1, items: [{ id: "arr1", person: person("riya", "Riya Kapoor", { batchYear: 2022 }), arrivedDaysAgo: 6, previousCity: "Pune", myOffer: null, wroteToMe: null }] },
    myArrival: null,
    offers: [],
    helpPanel: { askCount30d: 12, pendingNotesForMe: 2, cityHelpOn: false, openToCount: 2 },
    alumni: {
      total: 4,
      items: [
        alum(person("sneha", "Sneha Nair"), { open: true, limit: 2, spotsLeft: 1, askedByMe: false }),
        alum(person("vikram", "Vikram Rao"), closed, "Same department"),
        alum(person("karan", "Karan Singh"), { open: true, limit: 3, spotsLeft: 2, askedByMe: true }),
        alum(person("pooja", "Pooja Iyer"), { open: true, limit: 2, spotsLeft: 0, askedByMe: false }),
      ],
    },
    posts: [],
    postsHasMore: false,
    chapterLink: null,
    helpers: [],
    others: [],
    pendingCityAsks: 0,
    country: null,
    ...over,
  };
}

function world(list: CitiesList, city: CityPayload | null) {
  authState.value = {
    status: "authenticated",
    person: { personId: "p1", institutionalEmail: "a@iitbhu.ac.in", role: "alumni" },
    myProfile: { id: "me1", fullName: "Me", openToPreferences: { selected: ["mentorship"], descriptions: {} } },
    refetch: vi.fn(),
  };
  apiGet.mockImplementation(async (path: string) => {
    if (path === "/v1/cities") return list;
    if (city && path === `/v1/cities/${city.place.placeId}`) return city;
    throw new Error(`unexpected ${path}`);
  });
}

function Where() {
  const l = useLocation();
  return <p data-testid="where">{`${l.pathname}${l.search}`}</p>;
}

function mount(path = "/intent/location") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/intent/location" element={<LocationPage />} />
          <Route path="/intent/location/:citySlug" element={<LocationPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const lists: CitiesList = {
  viewerCity: BLR,
  cities: [
    { ...BLR, count: 41 },
    { ...PUNE, count: 12 },
  ],
};

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset().mockResolvedValue({ data: {} });
  apiPatch.mockReset().mockResolvedValue({ data: {} });
  apiDelete.mockReset().mockResolvedValue({ data: {} });
  wallOpen.mockReset();
});
afterEach(cleanup);

describe("Cities page: city home (local)", () => {
  const post = (id: string, content: string, over: Partial<CityPayload["posts"][number]> = {}): CityPayload["posts"][number] => ({
    id,
    authorPersonId: `a-${id}`,
    authorFullName: "Asha Kamath",
    authorBatchYear: 2019,
    content,
    createdAt: new Date().toISOString(),
    viewerHasResponded: false,
    isMine: false,
    ...over,
  });

  it("needs-first landing: badge, headline, four shortcuts, requests, ask card and secondary links", async () => {
    world(lists, payload({
      posts: [post("r1", "Looking for a 2BHK near HSR\n\nMoving in mid-Nov, budget 55-65k. Open to flatmates too.")],
    }));
    mount();
    expect(await screen.findByText("Your city")).toBeTruthy();
    expect(within(screen.getByRole("main")).getByRole("heading", { level: 1, name: "Bengaluru" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What do you need in Bengaluru?" })).toBeTruthy();

    expect(screen.getByRole("button", { name: /Housing & flatmates/ })).toBeTruthy();
    expect(screen.getByText("Flats, flatmates and housing leads")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Neighborhoods/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Local services/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Meet people/ })).toBeTruthy();

    expect(screen.getByRole("heading", { name: "From the Bengaluru community" })).toBeTruthy();
    expect(screen.getByText("Open posts from the Wall, filtered to Bengaluru.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Looking for a 2BHK near HSR/ })).toBeTruthy();
    expect(screen.getByText(/Asha ’19 ·/)).toBeTruthy();

    expect(screen.getByRole("button", { name: "Ask the community" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Browse the Bengaluru alumni directory ›" }).getAttribute("href"))
      .toBe("/search?residenceCity=Bengaluru&residenceCountry=India");
    expect(screen.getByRole("link", { name: "Moved away? Update your city ›" }).getAttribute("href")).toBe("/profiles/me1?edit=city");

    // Retired sections stay gone: alumni list, helper panel, meetups, arrivals.
    expect(screen.queryByRole("heading", { name: "Alumni in Bengaluru" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "You can help" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Get together" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Something else?" })).toBeNull();
  });

  it("a shortcut prefills the Wall composer tagged with this city", async () => {
    world(lists, payload());
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Housing & flatmates/ }));
    expect(wallOpen).toHaveBeenCalledWith(
      expect.objectContaining({ placeId: "blr", category: "relocation", headline: "Housing or flatmates in Bengaluru" }),
    );
  });

  it("Ask the community opens the Wall composer tagged with this city, without a prefill", async () => {
    world(lists, payload());
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Ask the community" }));
    expect(wallOpen).toHaveBeenCalledWith(expect.objectContaining({ placeId: "blr", category: "relocation" }));
    expect((wallOpen.mock.calls[0]![0] as { headline?: string }).headline).toBeUndefined();
  });

  it("request cards carry no reply affordance and open the full request read-only", async () => {
    world(lists, payload({
      posts: [post("r1", "Looking for a 2BHK near HSR\n\nMoving in mid-Nov, budget 55-65k. Open to flatmates too.")],
    }));
    mount();
    const card = await screen.findByRole("button", { name: /Looking for a 2BHK near HSR/ });
    expect(screen.queryByRole("button", { name: /Reply/ })).toBeNull();
    expect(screen.queryByText(/replies|responded/i)).toBeNull();
    fireEvent.click(card);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Looking for a 2BHK near HSR")).toBeTruthy();
    expect(within(dialog).getByText(/Moving in mid-Nov/)).toBeTruthy();
    expect(within(dialog).getByText(/Asha Kamath/)).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /Reply|Respond|Send/i })).toBeNull();
  });

  it("View all posts loads the full list from the posts endpoint, then pages", async () => {
    world(lists, payload({ posts: [post("r1", "First\n\nOne"), post("r2", "Second"), post("r3", "Third")], postsHasMore: true }));
    const base = apiGet.getMockImplementation()!;
    const page1 = Array.from({ length: 20 }, (_, i) => post(`p${i}`, `Request ${i + 1}`));
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/v1/cities/blr/posts") return { posts: page1, nextCursor: "20" };
      if (path === "/v1/cities/blr/posts?cursor=20") return { posts: [post("p20", "Request 21")], nextCursor: null };
      return base(path);
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "View all posts →" }));
    expect(await screen.findByRole("button", { name: /Request 20/ })).toBeTruthy();
    expect(apiGet).toHaveBeenCalledWith("/v1/cities/blr/posts", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByRole("button", { name: /Request 21/ })).toBeTruthy();
    expect(apiGet).toHaveBeenCalledWith("/v1/cities/blr/posts?cursor=20", expect.anything());
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("empty city: the requests section stays useful and offers no View all", async () => {
    world(lists, payload({ posts: [], postsHasMore: false }));
    mount();
    expect(await screen.findByRole("button", { name: "Ask the Bengaluru community" })).toBeTruthy();
    expect(screen.queryByText(/Be the first to ask/)).toBeNull();
    expect(screen.queryByRole("button", { name: "View all posts →" })).toBeNull();
    expect(screen.getByRole("button", { name: "Ask the community" })).toBeTruthy();
  });

  it("a recent mover gets the 'show me as new in town' entry", async () => {
    world(lists, payload({ arrivalPrompt: true }));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Just moved? Show me as new in town ›" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});

describe("Cities page: newcomer (screen 6)", () => {
  const newcomer = () =>
    payload({
      viewerRole: "newcomer",
      arrivals: null,
      myArrival: { id: "arr9", visibleUntil: "2099-01-01", daysLeft: 24, previousCity: "Pune" },
      offers: [
        {
          id: "o1",
          offerer: person("vikram", "Vikram Rao", { batchYear: 2014 }),
          kinds: ["areas", "commute"],
          line: "Six years in Bengaluru.",
          createdAt: new Date().toISOString(),
          seen: false,
          myNote: null,
        },
        {
          id: "o2",
          offerer: person("ananya", "Ananya Das", { batchYear: 2019 }),
          kinds: ["areas"],
          line: null,
          createdAt: new Date().toISOString(),
          seen: true,
          myNote: { contactRequestId: "c1", status: "accepted" },
        },
      ],
    });

  it("lists offers newest first, marks them seen, and writes a note linked to the offer", async () => {
    world(lists, newcomer());
    mount();
    expect(await screen.findByText("Your city")).toBeTruthy();
    expect(screen.getByText("Shown as new to local alumni for 24 more days")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "2 alumni offered to help" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "New in Bengaluru" })).toBeNull();
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/cities/offers/seen"));
    expect(screen.getByText(/You wrote to Ananya · accepted/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Write to Vikram" }));
    const dialog = screen.getByRole("dialog", { name: "Write to Vikram" });
    const box = within(dialog).getByLabelText("Your note") as HTMLTextAreaElement;
    expect(box.value).toBe("Thanks for offering to help with areas to live and commute. I’ve just moved from Pune for ");
    fireEvent.change(box, { target: { value: `${box.value}a new job at Swiggy.` } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send to Vikram" }));
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith(
        "/v1/contact-requests",
        expect.objectContaining({ recipientPersonId: "vikram", source: "cities", sourceCategory: "newcomer", cityHelpOfferId: "o1" }),
      ),
    );
  });

  it("stop showing me as new", async () => {
    world(lists, newcomer());
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Stop showing me as new" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/cities/arrivals/end"));
  });
});

describe("Cities page: exploring another city", () => {
  // Approved 19:18 (decision 1): the same needs-first page for every selected city, badge "Exploring"
  // when the viewed city isn't the member's; helper, coffee-ask and Moving/Visiting entry points removed.
  const exploring = () =>
    payload({
      viewerRole: "arriver",
      viewerCity: PUNE,
      arrivals: null,
      helpPanel: null,
      alumni: null,
      posts: [],
    });

  it("shows the needs-first landing with the Exploring badge and city-tagged asks", async () => {
    world({ ...lists, viewerCity: PUNE }, exploring());
    mount("/intent/location/bengaluru");
    expect(await screen.findByText("Exploring")).toBeTruthy();
    expect(screen.queryByText("Your city")).toBeNull();
    expect(screen.getByRole("heading", { name: "What do you need in Bengaluru?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Local services/ }));
    expect(wallOpen).toHaveBeenCalledWith(
      expect.objectContaining({ placeId: "blr", category: "relocation", headline: "Local services in Bengaluru" }),
    );
    expect(screen.getByRole("link", { name: "Browse the Bengaluru alumni directory ›" }).getAttribute("href"))
      .toBe("/search?residenceCity=Bengaluru&residenceCountry=India");
  });

  it("old contact entry points are gone from Cities", async () => {
    world({ ...lists, viewerCity: PUNE }, exploring());
    mount("/intent/location/bengaluru");
    await screen.findByText("Exploring");
    expect(screen.queryByRole("heading", { name: "Alumni who help people settle in" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Others in Bengaluru" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ask for help" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Moving here" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Not the right people? Ask everyone on the Wall" })).toBeNull();
  });
});

describe("Cities page: typing your city (no list to pick from)", () => {
  const LEEDS: CityRef = { placeId: "leeds-1", city: "Leedsy", country: "United Kingdom", slug: "leedsy" };
  /** The server's cities list, changed by a successful profile save (as the real API would). */
  function serverWorld(start: CitiesList, afterSave: (body: { residenceCity: string; residenceCountry: string }) => CitiesList, cityPayloads: CityPayload[] = []) {
    let current = start;
    world(start, null);
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/v1/cities") return current;
      const hit = cityPayloads.find((c) => path === `/v1/cities/${c.place.placeId}`);
      if (hit) return hit;
      throw new Error(`unexpected ${path}`);
    });
    apiPatch.mockImplementation(async (_path: string, body: { residenceCity: string; residenceCountry: string }) => {
      current = afterSave(body);
      return { data: { profile: {}, arrivalPrompt: null } };
    });
  }
  const searched = () => apiGet.mock.calls.some(([p]) => String(p).includes("/v1/cities/search"));

  it("no city or country saved: asks for both, saves exactly what was typed, never searches, then shows it as saved", async () => {
    serverWorld({ viewerCity: null, viewerResidence: null, cities: lists.cities }, (b) => ({
      viewerCity: null,
      viewerResidence: { city: b.residenceCity, country: b.residenceCountry },
      cities: lists.cities,
    }));
    mount();
    expect(await screen.findByRole("heading", { name: "Where do you live?" })).toBeTruthy();
    // The city box is plain text: no suggestion list (the country box keeps its country suggestions).
    expect(screen.queryByRole("combobox", { name: "City" })).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
    const browse = screen.getByRole("region", { name: "Or browse a city" });
    expect(within(browse).getByRole("link", { name: /Bengaluru/ }).getAttribute("href")).toBe("/intent/location/bengaluru");
    fireEvent.change(screen.getByRole("textbox", { name: "City" }), { target: { value: "  Chhapra Kalan " } });
    fireEvent.change(screen.getByRole("combobox", { name: "Country" }), { target: { value: "India" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to my profile" }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledWith("/v1/me/profile", { residenceCity: "Chhapra Kalan", residenceCountry: "India" }));
    expect(await screen.findByText("Saved to your profile.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Chhapra Kalan, India" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Where do you live?" })).toBeNull();
    expect(screen.queryByText(/review/i)).toBeNull();
    expect(searched()).toBe(false);
  });

  it("a saved country is reused (not asked again) and can be changed on purpose", async () => {
    serverWorld({ viewerCity: null, viewerResidence: { city: null, country: "India" }, cities: lists.cities }, (b) => ({
      viewerCity: null,
      viewerResidence: { city: b.residenceCity, country: b.residenceCountry },
      cities: lists.cities,
    }));
    mount();
    expect(await screen.findByText("Country: India")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Country" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "City" }), { target: { value: "Leedsy" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to my profile" }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledWith("/v1/me/profile", { residenceCity: "Leedsy", residenceCountry: "India" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit your city" }));
    fireEvent.click(screen.getByRole("button", { name: "Change country" }));
    expect((screen.getByRole("combobox", { name: "Country" }) as HTMLInputElement).value).toBe("India");
  });

  it("missing city or country: says so and doesn't save", async () => {
    serverWorld({ viewerCity: null, viewerResidence: null, cities: lists.cities }, () => ({ viewerCity: null, viewerResidence: null, cities: lists.cities }));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Save to my profile" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Type the city you live in.");
    fireEvent.change(screen.getByRole("textbox", { name: "City" }), { target: { value: "Leedsy" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to my profile" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Add the country too.");
    expect(apiPatch).not.toHaveBeenCalled();
  });

  it("a failed save is an error, not a false 'saved': the form and what you typed stay", async () => {
    world({ viewerCity: null, viewerResidence: { city: null, country: "India" }, cities: lists.cities }, null);
    apiPatch.mockResolvedValue({ error: { code: "NETWORK_ERROR", message: "offline" } });
    mount();
    fireEvent.change(await screen.findByRole("textbox", { name: "City" }), { target: { value: "Leedsy" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to my profile" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn’t save: check your connection and try again.");
    expect((screen.getByRole("textbox", { name: "City" }) as HTMLInputElement).value).toBe("Leedsy");
    expect(screen.queryByText(/Saved/)).toBeNull();
  });

  it("after a refresh, a saved city that isn't linked shows as saved (no review wording) and can be corrected", async () => {
    serverWorld({ viewerCity: null, viewerResidence: { city: "Leedsy", country: "United Kingdom" }, cities: lists.cities }, (b) => ({
      viewerCity: null,
      viewerResidence: { city: b.residenceCity, country: b.residenceCountry },
      cities: lists.cities,
    }));
    mount();
    expect(await screen.findByRole("heading", { name: "Leedsy, United Kingdom" })).toBeTruthy();
    expect(screen.getByText("Saved on your profile.")).toBeTruthy();
    expect(screen.queryByText(/review/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit your city" }));
    const cityBox = screen.getByRole("textbox", { name: "City" }) as HTMLInputElement;
    expect(cityBox.value).toBe("Leedsy");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Saved on your profile.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit your city" }));
    fireEvent.change(screen.getByRole("textbox", { name: "City" }), { target: { value: "Leeds" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to my profile" }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledWith("/v1/me/profile", { residenceCity: "Leeds", residenceCountry: "United Kingdom" }));
    expect(await screen.findByRole("heading", { name: "Leeds, United Kingdom" })).toBeTruthy();
    expect(screen.getByText("Saved to your profile.")).toBeTruthy();
  });

  it("a save that links to an approved city opens that city", async () => {
    serverWorld(
      { viewerCity: null, viewerResidence: null, cities: lists.cities },
      () => ({ viewerCity: BLR, viewerResidence: { city: "Bangalore", country: "India" }, cities: lists.cities }),
      [payload()],
    );
    mount();
    fireEvent.change(await screen.findByRole("textbox", { name: "City" }), { target: { value: "Bangalore" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Country" }), { target: { value: "India" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to my profile" }));
    expect(await screen.findByRole("heading", { name: "What do you need in Bengaluru?" })).toBeTruthy();
    expect(screen.getByText("Saved to your profile.")).toBeTruthy();
    expect(searched()).toBe(false);
  });

  it("a save that creates a city waiting for review opens its page with the review notice", async () => {
    const pendingPage = payload({
      place: LEEDS,
      viewerCity: LEEDS,
      review: { status: "pending", message: "This city is waiting for review. Until then only the people who live here and admins can see this page.", rejectionReason: null },
      v1Enabled: false,
      counts: { alumni: 1, openToCityHelp: 0 },
      arrivals: null,
      helpPanel: null,
    });
    serverWorld(
      { viewerCity: null, viewerResidence: { city: null, country: "United Kingdom" }, cities: lists.cities },
      () => ({ viewerCity: { ...LEEDS, status: "pending" }, viewerResidence: { city: "Leedsy", country: "United Kingdom" }, cities: lists.cities }),
      [pendingPage],
    );
    mount();
    fireEvent.change(await screen.findByRole("textbox", { name: "City" }), { target: { value: "Leedsy" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to my profile" }));
    expect((await screen.findByText(/This city is waiting for review/)).closest("[role=status]")).toBeTruthy();
  });
});

describe("Cities page: other cities (check 13)", () => {
  it("a non-Bengaluru local gets the same needs-first landing; requests stay empty without v1 posts", async () => {
    const pune = payload({
      place: PUNE,
      viewerCity: PUNE,
      v1Enabled: false,
      counts: { alumni: 12, openToCityHelp: 1 },
      arrivals: null,
      helpPanel: null,
      posts: [],
    });
    world({ ...lists, viewerCity: PUNE }, pune);
    mount();
    expect(await screen.findByRole("button", { name: "Change city: Pune" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "What do you need in Pune?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask the Pune community" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask the community" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Alumni in Pune" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "You can help" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Get together" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Something else?" })).toBeNull();
  });

  it("the city switcher lists cities with live counts", async () => {
    world(lists, payload());
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Change city: Bengaluru" }));
    expect(screen.getByRole("button", { name: "Change city: Bengaluru" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByRole("heading", { level: 2, name: "Bengaluru" })).toBeNull();
    const dialog = screen.getByRole("dialog", { name: "All cities" });
    expect(within(dialog).getByRole("link", { name: /Pune.*12 alumni/ }).getAttribute("href")).toBe("/intent/location/pune");
  });
});


describe("Cities page: city review", () => {
  const LEEDS = { placeId: "leeds-1", city: "Leedsy", country: "United Kingdom", slug: "leedsy" };
  const mine = (review: CityPayload["review"]) =>
    payload({
      place: LEEDS,
      viewerCity: LEEDS,
      review,
      v1Enabled: false,
      counts: { alumni: 2, openToCityHelp: 0 },
      arrivals: null,
      helpPanel: null,
    });

  it("your own city waiting for review says so (it isn't listed for anyone else)", async () => {
    world(
      { viewerCity: { ...LEEDS, status: "pending" }, cities: [{ ...BLR, count: 41 }] },
      mine({ status: "pending", message: "This city is waiting for review. Until then only the people who live here and admins can see this page.", rejectionReason: null }),
    );
    mount();
    expect((await screen.findByText(/This city is waiting for review/)).closest("[role=status]")).toBeTruthy();
    expect(screen.queryByText(/Reason:/)).toBeNull();
  });

  it("a rejected city shows the reason to the person who typed it, with a way to change city", async () => {
    world(
      { viewerCity: { ...LEEDS, status: "rejected" }, cities: [{ ...BLR, count: 41 }] },
      mine({ status: "rejected", message: "This city wasn't added.", rejectionReason: "Not a real city name" }),
    );
    mount();
    expect(await screen.findByText("This city wasn't added.")).toBeTruthy();
    expect(screen.getByText("Reason: Not a real city name")).toBeTruthy();
    expect(screen.getByRole("link", { name: "change your city" }).getAttribute("href")).toBe("/profiles/me1?edit=city");
  });
});
