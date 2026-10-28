import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ConnectionThread } from "../src/pages/ConnectionThread";

const authState = vi.hoisted(() => ({
  value: {
    status: "authenticated",
    person: { personId: "viewer-1", institutionalEmail: "viewer@iitbhu.ac.in" }
  } as unknown
}));

vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <header /> }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: vi.fn() }));
import { assertApiGet } from "../src/lib/assertApiGet";

Element.prototype.scrollIntoView = () => {};

const THREAD_ID = "thread-1";

function detailResponse(status: "open" | "closed" | "declined") {
  return {
    thread: {
      id: THREAD_ID,
      initiatorPersonId: "viewer-1",
      recipientPersonId: "other-1",
      status,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z"
    },
    counterpartyPersonId: "other-1",
    counterpartyFullName: "Other Person",
    counterpartyDepartmentCode: "cse",
    counterpartyDepartmentName: "Computer Science and Engineering",
    counterpartyBatchYear: 2019,
    messages: [
      {
        id: "m-1",
        authorPersonId: "viewer-1",
        body: "First old message",
        createdAt: "2026-09-10T00:00:00.000Z",
        editedAt: null,
        replyTo: null,
        authorIsDemo: false
      },
      {
        id: "m-2",
        authorPersonId: "other-1",
        body: "Second old message",
        createdAt: "2026-09-12T00:00:00.000Z",
        editedAt: null,
        replyTo: null,
        authorIsDemo: false
      }
    ],
    disclosures: [],
    messageCount: 2,
    showShareNudge: false,
    showOfflineContactPrompt: false,
    referralReplyCount: 0,
    availableDisclosures: [],
    kind: "general"
  };
}

function mountThread() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/connections/${THREAD_ID}`]}>
        <Routes>
          <Route path="/connections/:threadId" element={<ConnectionThread />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(cleanup);

describe("ConnectionThread message retention UI", () => {
  it("shows messages older than five days with no deletion warning", async () => {
    vi.mocked(assertApiGet).mockResolvedValue(detailResponse("open"));
    mountThread();
    await waitFor(() => expect(screen.getByText("First old message")).toBeTruthy());
    expect(screen.getByText("Second old message")).toBeTruthy();
    expect(screen.queryByText(/deleted/i)).toBeNull();
    expect(document.querySelector(".connection-thread-page__retention-banner")).toBeNull();
  });

  it.each(["closed", "declined"] as const)(
    "keeps history visible after the conversation is %s",
    async (status) => {
      vi.mocked(assertApiGet).mockResolvedValue(detailResponse(status));
      mountThread();
      await waitFor(() => expect(screen.getByText("First old message")).toBeTruthy());
      expect(screen.getByText("Second old message")).toBeTruthy();
      expect(
        screen.getByText(`This conversation is ${status === "declined" ? "declined" : "closed"}.`)
      ).toBeTruthy();
      expect(screen.queryByText(/deleted in/i)).toBeNull();
    }
  );
});
