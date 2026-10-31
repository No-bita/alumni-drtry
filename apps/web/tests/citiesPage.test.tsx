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
    nudgeFrequency: "weekly",
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
    if (path.startsWith("/v1/cities/search")) return { places: [BLR] };
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

describe("Cities page: local view (screen 1)", () => {
  it("opens on your own city with the sections in order and no message button for anyone not open to coffee", async () => {
    world(lists, payload());
    mount();
    expect(await screen.findByRole("button", { name: "Change city: Bengaluru" })).toBeTruthy();
    expect(await screen.findByText("41 alumni live here")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See all 41 alumni in Bengaluru" }).getAttribute("href")).toBe("/search?residenceCity=Bengaluru&residenceCountry=India");
    expect(screen.getByRole("link", { name: "Moved away? Update your city" }).getAttribute("href")).toBe("/profiles/me1?edit=city");

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf("New in Bengaluru")).toBeLessThan(headings.indexOf("You can help"));
    expect(headings.indexOf("You can help")).toBeLessThan(headings.indexOf("Alumni in Bengaluru"));
    expect(headings.indexOf("Alumni in Bengaluru")).toBeLessThan(headings.indexOf("Get together"));

    expect(screen.getByRole("button", { name: "Offer to help Riya" })).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("moving-help searches for Bengaluru in the last 30 days")).toBeTruthy();
    expect(screen.getByRole("link", { name: "2 notes waiting for you" })).toBeTruthy();

    const rows = within(screen.getByRole("region", { name: "Alumni in Bengaluru" }).querySelector("ul")!);
    const vikram = rows.getByText("Vikram Rao").closest("li")!;
    // Acceptance check 1: someone not open to coffee gets View, never a message/ask button.
    expect(within(vikram).queryByRole("button")).toBeNull();
    expect(within(vikram).getByRole("link", { name: "View Vikram Rao’s profile" })).toBeTruthy();
    const pooja = rows.getByText("Pooja Iyer").closest("li")!;
    const full = within(pooja).getByRole("button", { name: "Coffee asks full this week, opens Monday" });
    expect((full as HTMLButtonElement).disabled).toBe(true);
    expect(within(rows.getByText("Karan Singh").closest("li")!).getByText("Ask sent")).toBeTruthy();
    expect(within(rows.getByText("Sneha Nair").closest("li")!).getByText(/Coffee: 1 spot left this week/)).toBeTruthy();
  });

  it("coffee ask: Send stays off until the reason has 40 characters, then sends a cities/coffee note", async () => {
    world(lists, payload());
    mount();
    const sneha = (await screen.findByText("Sneha Nair")).closest("li")!;
    fireEvent.click(within(sneha).getByRole("button", { name: "Ask for coffee" }));
    const dialog = screen.getByRole("dialog", { name: "Ask Sneha for coffee" });
    expect(within(dialog).getByText("Sneha takes 2 coffee asks a week · 1 spot left")).toBeTruthy();
    const send = within(dialog).getByRole("button", { name: "Send ask" }) as HTMLButtonElement;
    const box = within(dialog).getByLabelText(/Why Sneha\?/);
    fireEvent.change(box, { target: { value: "x".repeat(39) } });
    expect(send.disabled).toBe(true);
    fireEvent.change(box, { target: { value: "Same batch, and I’d love to hear how you moved into data." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Weekend" }));
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    const [url, body] = apiPost.mock.calls[0]!;
    expect(url).toBe("/v1/contact-requests");
    expect(body).toMatchObject({ recipientPersonId: "sneha", source: "cities", sourceCategory: "coffee" });
    expect((body as { message: string }).message).toMatch(/When suits me: Weekend$/);
  });

  it("shows the server’s weekly-limit refusal in plain words", async () => {
    world(lists, payload());
    apiPost.mockResolvedValue({ error: { code: "COFFEE_LIMIT_REACHED", message: "full" } });
    mount();
    const sneha = (await screen.findByText("Sneha Nair")).closest("li")!;
    fireEvent.click(within(sneha).getByRole("button", { name: "Ask for coffee" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Why Sneha\?/), { target: { value: "y".repeat(45) } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send ask" }));
    expect(await within(dialog).findByText("Sneha is full this week. Try again from Monday.")).toBeTruthy();
  });

  it("offer to help is not a message: needs at least one kind, posts an offer, says nothing is sent", async () => {
    world(lists, payload());
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Offer to help Riya" }));
    const dialog = screen.getByRole("dialog", { name: "Offer to help Riya" });
    expect(within(dialog).getByText(/No message is sent/)).toBeTruthy();
    const send = within(dialog).getByRole("button", { name: "Send offer" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Commute" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Areas to live" }));
    fireEvent.click(send);
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/v1/cities/arrivals/arr1/offers", { kinds: ["areas", "commute"] }));
  });

  it("after offering: a status row, never a read receipt", async () => {
    const p = payload();
    p.arrivals!.items[0] = { ...p.arrivals!.items[0]!, myOffer: { id: "off1" } };
    world(lists, p);
    mount();
    expect(await screen.findByText(/You offered to help · Riya decides/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Offer to help Riya" })).toBeNull();
    expect(screen.queryByText(/seen|read/i)).toBeNull();
  });

  it("New in town collapses entirely when nobody opted in", async () => {
    world(lists, payload({ arrivals: { total: 0, items: [] } }));
    mount();
    await screen.findByRole("button", { name: "Change city: Bengaluru" });
    expect(screen.queryByRole("heading", { name: "New in Bengaluru" })).toBeNull();
  });

  it("post a meetup idea opens the Wall composer tagged with this city", async () => {
    world(lists, payload());
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Post a meetup idea" }));
    expect(wallOpen).toHaveBeenCalledWith(expect.objectContaining({ placeId: "blr", category: "relocation" }));
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
    expect(await screen.findByText("Your city · new in town")).toBeTruthy();
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

describe("Cities page: arriver (screen 7)", () => {
  const arriver = (pending: number) =>
    payload({
      viewerRole: "arriver",
      viewerCity: PUNE,
      arrivals: null,
      helpPanel: null,
      alumni: null,
      posts: [],
      helpers: [
        {
          ...alum(person("vikram", "Vikram Rao", { batchYear: 2014 }), closed, null),
          replyStats: { total: 6, replied: 5, medianDays: 2 },
          yourCityAsk: null,
        },
      ],
      others: [
        alum(person("sneha", "Sneha Nair"), { open: true, limit: 2, spotsLeft: 1, askedByMe: false }),
        alum(person("karan", "Karan Singh"), closed, "2 batches apart"),
      ],
      pendingCityAsks: pending,
    });

  it("shows helpers with reply stats, Moving/Visiting, Others with Ask only for coffee, and the Wall fallback", async () => {
    world({ ...lists, viewerCity: PUNE }, arriver(0));
    mount("/intent/location/bengaluru");
    expect(await screen.findByRole("link", { name: "‹ Your city: Pune" })).toBeTruthy();
    expect(screen.queryByText("41 alumni live here · 6 open to city help")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "What brings you to Bengaluru?" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Moving here" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Replied to 5 of 6 notes · usually within 2 days")).toBeTruthy();
    const others = screen.getByRole("region", { name: "Others in Bengaluru" });
    expect(within(within(others).getByText("Sneha Nair").closest("li")!).getByRole("button", { name: "Ask" })).toBeTruthy();
    expect(within(within(others).getByText("Karan Singh").closest("li")!).queryByRole("button")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Ask for help" }));
    const dialog = screen.getByRole("dialog", { name: "Ask Vikram for help" });
    const send = within(dialog).getByRole("button", { name: "Send ask" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Commute" }));
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith(
        "/v1/contact-requests",
        expect.objectContaining({ recipientPersonId: "vikram", source: "cities", sourceCategory: "relocation" }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Not the right people? Ask everyone on the Wall" }));
    expect(wallOpen).toHaveBeenCalledWith(expect.objectContaining({ placeId: "blr", headline: "Moving to Bengaluru" }));
  });

  it("at 3 pending city-help asks the button says so and is off", async () => {
    world({ ...lists, viewerCity: PUNE }, arriver(3));
    mount("/intent/location/bengaluru");
    const btn = (await screen.findByRole("button", { name: "3 asks waiting · send more once they reply" })) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Ask for help" })).toBeNull();
  });
});

describe("Cities page: no city (screen 8)", () => {
  it("asks where you live, saves a canonical place to the profile, and lists cities to browse", async () => {
    world({ viewerCity: null, cities: lists.cities }, null);
    mount();
    expect(await screen.findByRole("heading", { name: "Where do you live?" })).toBeTruthy();
    const browse = screen.getByRole("region", { name: "Or browse a city" });
    expect(within(browse).getByRole("link", { name: /Bengaluru/ }).getAttribute("href")).toBe("/intent/location/bengaluru");
    fireEvent.change(screen.getByRole("combobox", { name: "City" }), { target: { value: "beng" } });
    fireEvent.click(await screen.findByRole("button", { name: "Bengaluru, India" }));
    fireEvent.click(screen.getByRole("button", { name: "Save to my profile" }));
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/v1/me/profile", { residenceCity: "Bengaluru", residenceCountry: "India" }),
    );
  });
});

describe("Cities page: other cities (check 13)", () => {
  it("a non-Bengaluru local sees only the header and the alumni list", async () => {
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
    expect(await screen.findByRole("heading", { name: "Alumni in Pune" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "New in Pune" })).toBeNull();
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


describe("City help optimistic switch", () => {
  it("keeps the successful value while old server data waits for refetch", async () => {
    world(lists, payload());
    mount();
    const control = await screen.findByRole("switch", { name: "Open to city help" });
    expect(control.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(control);
    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    await waitFor(() => expect(control.hasAttribute("disabled")).toBe(false));
    expect(control.getAttribute("aria-checked")).toBe("true");
  });
  it("restores the prior value after a failed save", async () => {
    world(lists, payload());
    apiPatch.mockResolvedValue({ error: { code: "FAILED" } });
    mount();
    const control = await screen.findByRole("switch", { name: "Open to city help" });
    fireEvent.click(control);
    await screen.findByRole("alert");
    expect(control.getAttribute("aria-checked")).toBe("false");
  });
});
