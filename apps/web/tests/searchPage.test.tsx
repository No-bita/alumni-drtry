import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const get = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: get }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));
vi.mock("../src/lib/betaAnalytics", () => ({ trackBetaUsageEvent: vi.fn() }));

import { Search } from "../src/pages/Search";

beforeEach(() => get.mockReset());
afterEach(cleanup);

function mount(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={qc}>
        <Search />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("Search page", () => {
  it("shows the empty state when nothing matches", async () => {
    get.mockResolvedValue({ results: [], pageInfo: { nextCursor: null } });
    mount("/search");
    expect(await screen.findByText("No alumni match your search")).toBeTruthy();
  });

  it("sends URL filters to the API", async () => {
    get.mockResolvedValue({ results: [], pageInfo: { nextCursor: null } });
    mount("/search?q=rahul&batch=2015");
    await waitFor(() => expect(get).toHaveBeenCalled());
    const url = String(get.mock.calls[0][0]);
    expect(url).toContain("/v1/search?");
    expect(url).toContain("q=rahul");
    expect(url).toContain("batch=2015");
    expect(url).toContain("limit=20");
  });
});
