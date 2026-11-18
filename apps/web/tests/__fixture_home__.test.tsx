import { describe, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { writeFileSync } from "node:fs";
import { Home } from "../src/pages/Home";

vi.mock("../src/api/client", async (orig) => ({ ...(await orig<Record<string, unknown>>()), api: { post: vi.fn().mockResolvedValue({ data: {} }), get: vi.fn().mockImplementation((url) => {
    return Promise.resolve({ data: { results: [], pageInfo: { hasMore: false }, sent: [], requests: [], replyStats: null, intentcasts: [], totalCount: 0 } });
  }) } }));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({
    status: "authenticated",
    person: { personId: "p1", institutionalEmail: "a@iitbhu.ac.in" },
    myProfile: { batchYear: 2019, departmentCode: "CSE", createdAt: new Date().toISOString(), profileCompletedAt: new Date().toISOString(), openToPreferences: null },
    refetch: vi.fn(),
  }),
}));

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null })) as never;
  window.history.replaceState({}, "", "/home?mockHome=1");
});
afterEach(cleanup);

describe("home fixture", () => {
  it("dumps home with mocked auth and dev mocks", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/home?mockHome=1"]}><Home /></MemoryRouter>
      </QueryClientProvider>
    );
    await screen.findByText(/Alma Mater|Home|For you|All posts/i, undefined, { timeout: 8000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    writeFileSync("/tmp/fixture-home-declutter.html", document.body.innerHTML);
  }, 20000);
});
