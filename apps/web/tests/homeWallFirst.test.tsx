import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const apiGet = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: apiGet }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/components/WhatsAppFloatingButton", () => ({ WhatsAppFloatingButton: () => null }));
vi.mock("../src/lib/betaAnalytics", () => ({ trackBetaUsageEvent: vi.fn() }));

import { Home } from "../src/pages/Home";

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={["/home"]}>
      <QueryClientProvider client={qc}>{node}</QueryClientProvider>
    </MemoryRouter>,
  );
}

function signedIn() {
  authState.value = {
    status: "authenticated",
    person: { personId: "p1", institutionalEmail: "a@iitbhu.ac.in", role: "alumni" },
    myProfile: { id: "me1", fullName: "Me", onboardingCompletedAt: "2026-01-01" },
    logout: vi.fn(),
  };
}

/** Every API path Home touches gets an empty-but-valid answer unless overridden. */
function mockApi(overrides: Record<string, unknown> = {}) {
  apiGet.mockImplementation(async (path: string) => {
    if (path in overrides) return overrides[path];
    if (path === "/v1/contact-requests/inbox") return { requests: [] };
    if (path === "/v1/contact-requests/sent") return { requests: [] };
    if (path.startsWith("/v1/intentcasts")) return { intentcasts: [], pageInfo: { hasMore: false, nextCursor: null } };
    if (path.startsWith("/v1/search")) return { results: [], pageInfo: { hasMore: false } };
    if (path === "/v1/careers/my-company-demand") return { demand: null };
    throw new Error(path);
  });
}

function reachoutsContainer(container: HTMLElement) {
  return container.querySelector(".home-reachouts");
}

// jsdom has no matchMedia, so useMinWidth(1024) is false: Home renders its phone layout.
describe("Phone Home: Wall first when there are no reachouts", () => {
  beforeEach(() => {
    apiGet.mockReset();
    signedIn();
  });
  afterEach(cleanup);

  it("no waiting and no sent reachouts: the reachout cards move below the Wall", async () => {
    mockApi();
    const { container } = wrap(<Home />);
    await waitFor(() => expect(reachoutsContainer(container)?.className).toContain("home-reachouts--after-wall"));
  });

  it("a waiting reachout keeps the cards above the Wall", async () => {
    mockApi({
      "/v1/contact-requests/inbox": {
        requests: [
          {
            id: "r1",
            senderPersonId: "s1",
            senderFullName: "Junior One",
            message: "Could you refer me?",
            status: "pending",
            createdAt: new Date().toISOString(),
          },
        ],
      },
    });
    const { container } = wrap(<Home />);
    await waitFor(() => expect(reachoutsContainer(container)).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reachoutsContainer(container)?.className).not.toContain("home-reachouts--after-wall");
  });

  it("a sent reachout keeps the cards above the Wall", async () => {
    mockApi({
      "/v1/contact-requests/sent": {
        requests: [
          {
            id: "n1",
            recipientPersonId: "r9",
            recipientFullName: "Senior Nine",
            message: "Advice please",
            status: "pending",
            recipientContactShared: null,
            createdAt: new Date().toISOString(),
            respondedAt: null,
          },
        ],
      },
    });
    const { container } = wrap(<Home />);
    await waitFor(() => expect(reachoutsContainer(container)).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reachoutsContainer(container)?.className).not.toContain("home-reachouts--after-wall");
  });
});
