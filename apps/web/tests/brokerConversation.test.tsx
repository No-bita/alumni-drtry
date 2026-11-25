import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NotificationItem } from "../src/api/client";

const getMock = vi.hoisted(() => vi.fn());
const postMock = vi.hoisted(() => vi.fn());
const assertGet = vi.hoisted(() => vi.fn());
vi.mock("../src/api/client", () => ({ api: { get: getMock, post: postMock, patch: vi.fn() } }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: assertGet }));
vi.mock("../src/lib/betaAnalytics", () => ({ trackBetaUsageEvent: vi.fn() }));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({ status: "authenticated", person: { personId: "me", institutionalEmail: "me@iitbhu.ac.in" }, myProfile: { fullName: "Asha Rao" } }),
}));

import { conversationLinkLabel, readOnlyLabel, type BrokerConversation } from "../src/lib/broker";
import { BrokerConversationThread } from "../src/components/broker/BrokerConversationThread";
import { NotificationsList } from "../src/components/NotificationsList";
import { SentNotesSection } from "../src/components/SentNotesSection";
import { isShownNotification } from "../src/lib/notificationsQueries";

const conversation = (over: Partial<BrokerConversation> = {}): BrokerConversation => ({
  requestId: "r1",
  role: "asker",
  counterpart: { personId: "h1", fullName: "Vikram Iyer", departmentCode: "cse", batchYear: 2016 },
  request: {
    kind: "referral",
    company: "Swiggy",
    jobFunction: "product",
    experienceBand: "3_7",
    roleTitle: "Product Manager",
    jobUrl: "https://jobs.example.com/pm",
    message: "Referral request",
    details: null,
  },
  state: "open",
  readOnlyReason: null,
  readOnlyAt: "2026-12-09T10:00:00Z",
  canSend: true,
  unreadCount: 0,
  messageCount: 2,
  lastMessageAt: "2026-11-25T10:05:00Z",
  limits: { maxChars: 1000, maxUnanswered: 5, inactiveDays: 14, maxMessages: 200 },
  messages: [
    { id: "m1", mine: true, body: "Thanks for saying yes!", createdAt: "2026-11-25T10:00:00Z" },
    { id: "m2", mine: false, body: "Happy to. Apply here first: https://jobs.example.com/pm?ref=1.", createdAt: "2026-11-25T10:05:00Z" },
  ],
  ...over,
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="loc">{location.pathname}</div>;
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/somewhere"]}>
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

let current: BrokerConversation;
beforeEach(() => {
  current = conversation();
  assertGet.mockImplementation(async (path: string) => {
    if (path === "/v1/broker-requests/r1/conversation") return { conversation: current };
    if (path === "/v1/contact-requests/sent") {
      return {
        requests: [
          { id: "n1", recipientPersonId: "h1", recipientFullName: "Vikram Iyer", message: "Referral request", status: "accepted", recipientContactShared: null, brokerRequestId: "r1", createdAt: "2026-11-25T10:00:00Z", respondedAt: "2026-11-25T10:00:00Z" },
        ],
      };
    }
    throw new Error(`unexpected ${path}`);
  });
  postMock.mockImplementation(async (path: string, body?: { body?: string }) => {
    if (path.endsWith("/conversation/messages")) {
      const message = { id: "m3", mine: true, body: body?.body ?? "", createdAt: "2026-11-25T10:10:00Z" };
      current = { ...current, messages: [...current.messages, message] };
      return { data: { message } };
    }
    return { data: {} };
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the conversation", () => {
  it("shows both sides, keeps links as plain links (no previews) and promises no contact", async () => {
    const { container } = wrap(<BrokerConversationThread requestId="r1" />);
    expect(await screen.findByRole("link", { name: "Vikram Iyer" })).toBeTruthy();
    expect(screen.getByText("Referral · Swiggy · Product Manager")).toBeTruthy();
    expect(screen.getByText(/Only the two of you can see this conversation\. Contact details stay private unless you choose to share them\./)).toBeTruthy();
    const items = screen.getByRole("list", { name: "Messages" }).querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0]!.className).toContain("broker-convo__msg--mine");
    expect(items[1]!.className).not.toContain("--mine");
    const link = screen.getByRole("link", { name: "https://jobs.example.com/pm?ref=1" });
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(container.querySelector("img, iframe")).toBeNull();
    // Nothing read yet, so nothing to mark.
    expect(postMock).not.toHaveBeenCalledWith("/v1/broker-requests/r1/conversation/read", {});
  });

  it("reading new messages marks them read", async () => {
    current = conversation({ unreadCount: 1 });
    wrap(<BrokerConversationThread requestId="r1" />);
    await waitFor(() => expect(postMock).toHaveBeenCalledWith("/v1/broker-requests/r1/conversation/read", {}));
  });

  it("sends text, counts characters against the limit, and shows the server's limit messages", async () => {
    wrap(<BrokerConversationThread requestId="r1" />);
    const box = (await screen.findByLabelText("Message Vikram")) as HTMLTextAreaElement;
    expect(box.maxLength).toBe(1000);
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box, { target: { value: "  Job ID is JOB-1234  " } });
    expect(screen.getByText("18 / 1000")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(postMock).toHaveBeenCalledWith("/v1/broker-requests/r1/conversation/messages", { body: "Job ID is JOB-1234" }));
    expect(await screen.findByText("Job ID is JOB-1234")).toBeTruthy();
    expect(box.value).toBe("");

    postMock.mockImplementation(async () => ({ error: { code: "BROKER_MESSAGE_WAIT_FOR_REPLY", message: "You've sent 5 messages in a row. Wait for Vikram to reply." } }));
    fireEvent.change(box, { target: { value: "Any update?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect((await screen.findByRole("alert")).textContent).toBe("You've sent 5 messages in a row. Wait for Vikram to reply.");
    expect(box.value).toBe("Any update?");
  });

  it("either person can close it, after a confirmation", async () => {
    wrap(<BrokerConversationThread requestId="r1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Close conversation" }));
    expect(screen.getByText(/Neither of you can send messages after that/)).toBeTruthy();
    current = conversation({ state: "read_only", readOnlyReason: "closed_by_you", canSend: false, readOnlyAt: null });
    fireEvent.click(screen.getByRole("button", { name: "Close conversation" }));
    await waitFor(() => expect(postMock).toHaveBeenCalledWith("/v1/broker-requests/r1/conversation/close", {}));
    expect(await screen.findByText("You closed this conversation. You can still read it.")).toBeTruthy();
    expect(screen.queryByLabelText("Message Vikram")).toBeNull();
  });

  it("read-only: says why, keeps the messages, offers no composer", async () => {
    current = conversation({ state: "read_only", readOnlyReason: "inactive", canSend: false, readOnlyAt: null });
    wrap(<BrokerConversationThread requestId="r1" />);
    expect(await screen.findByText("This conversation went quiet for 14 days, so it's read-only now.")).toBeTruthy();
    expect(screen.getByText("Thanks for saying yes!")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close conversation" })).toBeNull();
  });

  it("anyone else: not available", async () => {
    assertGet.mockImplementation(async () => {
      throw Object.assign(new Error("Conversation not found."), { code: "BROKER_CONVERSATION_NOT_FOUND" });
    });
    wrap(<BrokerConversationThread requestId="r1" />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/Only the member who asked and the alum who said yes can see it/);
  });
});

describe("wording helpers", () => {
  it("card links and read-only reasons", () => {
    const base = { state: "open" as const, readOnlyReason: null, unreadCount: 0, messageCount: 0, lastMessageAt: null };
    expect(conversationLinkLabel(base, "Vikram")).toBe("Message Vikram");
    expect(conversationLinkLabel({ ...base, messageCount: 4 }, "Vikram")).toBe("Open conversation");
    expect(conversationLinkLabel({ ...base, unreadCount: 1 }, "Vikram")).toBe("1 new message");
    expect(conversationLinkLabel({ ...base, unreadCount: 3 }, "Vikram")).toBe("3 new messages");
    expect(readOnlyLabel("closed_by_them", "Vikram Iyer", 14)).toBe("Vikram Iyer closed this conversation. You can still read it.");
  });
});

describe("notifications for brokered requests", () => {
  const now = new Date().toISOString();
  const items: NotificationItem[] = [
    {
      kind: "broker_message_received",
      id: "bm:r1",
      occurredAt: now,
      unseen: true,
      requestId: "r1",
      requestKind: "referral",
      company: "Swiggy",
      counterpartPersonId: "h1",
      counterpartFullName: "Vikram Iyer",
      lastMessagePreview: "Happy to refer you.",
      unreadCount: 2,
    },
    {
      kind: "broker_request_connected",
      id: "br-con:r2",
      occurredAt: now,
      unseen: false,
      requestId: "r2",
      requestKind: "referral",
      company: "Zomato",
      roleTitle: "PM",
      helperPersonId: "h2",
      helperFullName: "Neha Iyer",
    },
  ];

  it("are shown (not hidden with paused messaging) and count on the bell", () => {
    for (const item of items) expect(isShownNotification(item)).toBe(true);
  });

  it("a yes and a new message open the conversation, even from the quick view", async () => {
    const { container } = wrap(<NotificationsList items={items} activationTarget="inbox" />);
    expect(screen.getByText(/sent you 2 messages about the referral at Swiggy/)).toBeTruthy();
    expect(screen.getByText("Happy to refer you.")).toBeTruthy();
    expect(screen.getByText(/said yes to your referral request at Zomato/)).toBeTruthy();
    expect(screen.getByText("You're connected. Message them here; contact details stay private unless one of you shares them.")).toBeTruthy();
    expect(container.textContent).not.toMatch(/Their contact|has your contact/);
    fireEvent.click(screen.getByRole("button", { name: "Open conversation with Vikram Iyer" }));
    expect(screen.getByTestId("loc").textContent).toBe("/requests/r1/conversation");
    fireEvent.click(screen.getByRole("button", { name: /Open conversation: Neha Iyer said yes/ }));
    expect(screen.getByTestId("loc").textContent).toBe("/requests/r2/conversation");
  });

  it("a brokered note you sent opens its conversation instead of showing a contact", async () => {
    wrap(<SentNotesSection enabled />);
    const link = await screen.findByRole("link", { name: "Open conversation" });
    expect(link.getAttribute("href")).toBe("/requests/r1/conversation");
    expect(screen.queryByText(/Contact shared/)).toBeNull();
  });
});
