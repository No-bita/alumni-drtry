import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const get = vi.hoisted(() => vi.fn());
vi.mock("../src/api/client", () => ({ api: { get, post: vi.fn() } }));
// This legacy admin page is excluded from the app build; isolate its search behavior.
vi.mock("../src/lib/queryKeys", () => ({ queryKeys: { admin: { locationCleanup: {
  placeDetail: (id: string) => ["admin", "place", id],
  inbox: () => ["admin", "inbox"],
} } } }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));

import { AdminPlaceDetail } from "../src/pages/AdminPlaceDetail";

function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function hits(label: string) {
  return { data: { places: [{ id: label, city_label: label, country: "India" }] }, error: null };
}

function ChangePlace() {
  const navigate = useNavigate();
  return <button onClick={() => navigate("/admin/places/other")}>Change place</button>;
}

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <MemoryRouter initialEntries={["/admin/places/current"]}>
      <QueryClientProvider client={client}>
        <ChangePlace />
        <Routes>
          <Route path="/admin/places/:placeId" element={<AdminPlaceDetail />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  return view;
}

async function search(value: string) {
  fireEvent.change(screen.getByLabelText("Search cities"), { target: { value } });
  await act(async () => { await vi.advanceTimersByTimeAsync(320); });
}

beforeEach(() => {
  vi.useFakeTimers();
  get.mockReset();
  get.mockImplementation((url: string) => {
    if (url.startsWith("/v1/admin/locations/places/")) {
      return Promise.resolve({ data: {
        place: { displayCity: "Current", displayCountry: "India" },
        linkedProfiles: 0, aliases: [], recentNotes: [],
      }, error: null });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AdminPlaceDetail combine search", () => {
  it("ignores an in-flight response after input becomes too short", async () => {
    const old = deferred();
    await mount();
    get.mockImplementationOnce(() => old.promise);
    await search("Delhi");
    await search("D");
    await act(async () => { old.resolve(hits("Stale Delhi")); });
    expect(screen.queryByText("Stale Delhi")).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("keeps newer results when requests resolve out of order", async () => {
    const old = deferred();
    const latest = deferred();
    await mount();
    get.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => latest.promise);
    await search("Delhi");
    await search("Mumbai");
    await act(async () => { latest.resolve(hits("Fresh Mumbai")); });
    expect(screen.getByText("Fresh Mumbai")).toBeTruthy();
    await act(async () => { old.resolve(hits("Stale Delhi")); });
    expect(screen.getByText("Fresh Mumbai")).toBeTruthy();
    expect(screen.queryByText("Stale Delhi")).toBeNull();
  });

  it("cancels the debounce when input becomes too short", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Search cities"), { target: { value: "Delhi" } });
    await search("D");
    expect(get.mock.calls.filter(([url]) => String(url).startsWith("/v1/admin/places?"))).toHaveLength(0);
  });

  it("ignores responses for the previous place after route changes", async () => {
    const old = deferred();
    await mount();
    get.mockImplementationOnce(() => old.promise);
    await search("Delhi");
    fireEvent.click(screen.getByRole("button", { name: "Change place" }));
    await act(async () => { old.resolve(hits("Stale Delhi")); });
    expect(screen.queryByText("Stale Delhi")).toBeNull();
  });
});
