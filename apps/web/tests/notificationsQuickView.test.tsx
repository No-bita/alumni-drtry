import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationsList } from "../src/components/NotificationsList";
import type { NotificationItem } from "../src/api/client";

vi.mock("../src/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/api/client")>();
  return { ...actual, api: { ...actual.api, patch: vi.fn() } };
});
vi.mock("../src/lib/betaAnalytics", () => ({ trackBetaUsageEvent: vi.fn() }));
vi.mock("../src/lib/invalidateAppQueries", () => ({
  invalidateNotificationRelatedQueries: vi.fn(),
}));
import { api } from "../src/api/client";

afterEach(cleanup);

const items: NotificationItem[] = [
  {
    kind: "contact_request_received",
    id: "n1",
    occurredAt: new Date().toISOString(),
    contactRequestId: "cr1",
    senderPersonId: "p1",
    senderFullName: "Rohit Verma",
    message: "Moving to Mumbai next month",
  },
  {
    kind: "contact_request_resolved",
    id: "n2",
    occurredAt: new Date().toISOString(),
    contactRequestId: "cr2",
    outcome: "accepted",
    recipientPersonId: "p2",
    recipientFullName: "Sneha Gupta",
  },
  {
    kind: "bulletin_response",
    id: "n3",
    occurredAt: new Date().toISOString(),
    responseId: "r1",
    intentcastId: "ic1",
    postPreview: "Looking for referral",
    responderPersonId: "p3",
    responderFullName: "Mandeep Singh",
    responseMessage: "Happy to refer you",
  },
];

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="loc">{location.pathname}</div>;
}

function wrap(ui: React.ReactNode, initialPath = "/search") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                {ui}
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("notification quick view (bottom sheet) activation", () => {
  it("opens the full inbox when any notification row is tapped", () => {
    wrap(<NotificationsList items={items} activationTarget="inbox" />);
    fireEvent.click(screen.getByRole("button", { name: /replied to your bulletin post/ }));
    expect(screen.getByTestId("loc").textContent).toBe("/notifications");
  });

  it("opens the full inbox for connection-request rows too", () => {
    wrap(<NotificationsList items={items} activationTarget="inbox" />);
    fireEvent.click(screen.getByRole("button", { name: /Rohit Verma wants to connect/ }));
    expect(screen.getByTestId("loc").textContent).toBe("/notifications");
  });

  it("keeps Accept/Decline as in-place actions that never navigate", async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: {}, error: null } as never);
    wrap(<NotificationsList items={items} activationTarget="inbox" />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/v1/contact-requests/cr1", { action: "accept" }),
    );
    expect(screen.getByTestId("loc").textContent).toBe("/search");
  });

  it("full inbox keeps the per-kind destinations", () => {
    wrap(<NotificationsList items={items} />);
    fireEvent.click(screen.getByRole("button", { name: /accepted your connection request/ }));
    expect(screen.getByTestId("loc").textContent).toBe("/profiles/p2");
  });
});
