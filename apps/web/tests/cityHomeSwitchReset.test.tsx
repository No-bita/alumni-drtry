import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CityPayload, CityRef, CitiesList } from "../src/lib/cities";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: apiGet }));
vi.mock("../src/components/Nav", () => ({ Nav: ({ appToolbarLead }: { appToolbarLead?: React.ReactNode }) => <nav>{appToolbarLead}</nav> }));
vi.mock("../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api/client")>()),
  api: { get: vi.fn(), post: apiPost, patch: vi.fn(), delete: vi.fn() },
}));
vi.mock("../src/components/PostBulletinFlow", async () => {
  const { useImperativeHandle } = await import("react");
  return {
    PostBulletinFlow: ({ ref }: { ref: import("react").Ref<{ open: (o: unknown) => void; close: () => void }> }) => {
      useImperativeHandle(ref, () => ({ open: vi.fn(), close: () => {} }));
      return null;
    },
  };
});

import { LocationPage } from "../src/pages/LocationPage";

const BLR: CityRef = { placeId: "blr", city: "Bengaluru", country: "India", slug: "bengaluru" };
const PUNE: CityRef = { placeId: "pune", city: "Pune", country: "India", slug: "pune" };

function payload(place: CityRef, over: Partial<CityPayload> = {}): CityPayload {
  return {
    place,
    viewerRole: "local",
    viewerCity: place,
    v1Enabled: true,
    counts: { alumni: 41, openToCityHelp: 6 },
    arrivalPrompt: false,
    arrivals: null,
    myArrival: null,
    offers: [],
    helpPanel: null,
    alumni: null,
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

const post = (id: string, content: string) => ({
  id,
  authorPersonId: `a-${id}`,
  authorFullName: "Asha Kamath",
  authorBatchYear: 2019,
  content,
  createdAt: new Date().toISOString(),
  viewerHasResponded: false,
  isMine: false,
});

const lists: CitiesList = {
  viewerCity: BLR,
  cities: [
    { ...BLR, count: 41 },
    { ...PUNE, count: 12 },
  ],
};

function world(blrPostsPage: () => Promise<{ posts: ReturnType<typeof post>[]; nextCursor: string | null }>) {
  authState.value = {
    status: "authenticated",
    person: { personId: "p1", institutionalEmail: "a@iitbhu.ac.in", role: "alumni" },
    myProfile: { id: "me1", fullName: "Me" },
    refetch: vi.fn(),
  };
  const blr = payload(BLR, { posts: [post("b0", "BLR PREVIEW MARKER")], postsHasMore: true });
  const pune = payload(PUNE, { posts: [post("p0", "PUNE PREVIEW MARKER")], postsHasMore: true });
  apiGet.mockImplementation(async (path: string) => {
    if (path === "/v1/cities") return lists;
    if (path === "/v1/cities/blr") return blr;
    if (path === "/v1/cities/pune") return pune;
    if (path === "/v1/cities/blr/posts") return blrPostsPage();
    throw new Error(`unexpected ${path}`);
  });
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={["/intent/location/bengaluru"]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/intent/location" element={<LocationPage />} />
          <Route path="/intent/location/:citySlug" element={<LocationPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function switchCity(from: string, to: string, linkRe: RegExp) {
  fireEvent.click(await screen.findByRole("button", { name: `Change city: ${from}` }));
  const dialog = screen.getByRole("dialog", { name: "All cities" });
  fireEvent.click(within(dialog).getByRole("link", { name: linkRe }));
  await screen.findByRole("heading", { name: `What do you need in ${to}?` });
}

/** Cache both city payloads by visiting each once, so later switches render from cache with no unmount. */
async function warmBothCities() {
  await screen.findByRole("heading", { name: "What do you need in Bengaluru?" });
  await switchCity("Bengaluru", "Pune", /Pune/);
  await switchCity("Pune", "Bengaluru", /Bengaluru/);
}

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset().mockResolvedValue({ data: {} });
});
afterEach(cleanup);

describe("Cities page: switching cities resets per-city state", () => {
  it("an expanded 'View all posts' list from the old city never shows under the new city", async () => {
    world(async () => ({ posts: [post("b1", "BLR EXPANDED MARKER")], nextCursor: null }));
    mount();
    await warmBothCities();
    fireEvent.click(await screen.findByRole("button", { name: "View all posts →" }));
    expect(await screen.findByRole("button", { name: /BLR EXPANDED MARKER/ })).toBeTruthy();

    await switchCity("Bengaluru", "Pune", /Pune/);

    expect(screen.queryByText(/BLR EXPANDED MARKER/)).toBeNull();
    expect(screen.queryByText(/BLR PREVIEW MARKER/)).toBeNull();
    expect(screen.getByRole("button", { name: /PUNE PREVIEW MARKER/ })).toBeTruthy();
    // The expansion state itself is reset: Pune offers its own "View all posts" again.
    expect(screen.getByRole("button", { name: "View all posts →" })).toBeTruthy();
  });

  it("a posts request that resolves after the switch cannot overwrite the new city", async () => {
    let resolveBlr: (page: { posts: ReturnType<typeof post>[]; nextCursor: string | null }) => void = () => {};
    world(
      () =>
        new Promise((resolve) => {
          resolveBlr = resolve;
        }),
    );
    mount();
    await warmBothCities();
    fireEvent.click(await screen.findByRole("button", { name: "View all posts →" }));

    await switchCity("Bengaluru", "Pune", /Pune/);

    await act(async () => {
      resolveBlr({ posts: [post("b1", "BLR LATE MARKER")], nextCursor: null });
    });

    expect(screen.queryByText(/BLR LATE MARKER/)).toBeNull();
    expect(screen.getByRole("button", { name: /PUNE PREVIEW MARKER/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "From the Pune community" })).toBeTruthy();
  });
});
