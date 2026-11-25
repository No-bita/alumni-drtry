import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { NotificationItem } from "../src/api/client";

const list = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock("../src/components/WhatsAppFloatingButton", () => ({ WhatsAppFloatingButton: () => null }));
vi.mock("../src/components/FeedbackDialog", () => ({ FeedbackDialog: () => null }));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({
    status: "authenticated",
    person: { personId: "p1", institutionalEmail: "test@iitbhu.ac.in", role: "alumni" },
    myProfile: { id: "me-1", fullName: "Test Alum", onboardingCompletedAt: "2026-01-01" },
    logout: vi.fn(),
  }),
}));
vi.mock("../src/lib/notificationsQueries", async (importOriginal) => ({
  isShownNotification: (await importOriginal<typeof import("../src/lib/notificationsQueries")>()).isShownNotification,
  useNotificationsList: () => ({ data: { items: list.items } }),
}));
import { Nav } from "../src/components/Nav";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.appShell;
});

const at = new Date().toISOString();
const message = (unseen: boolean): NotificationItem => ({
  kind: "broker_message_received",
  id: "bm:r1",
  occurredAt: at,
  unseen,
  requestId: "r1",
  requestKind: "referral",
  company: "Swiggy",
  counterpartPersonId: "h1",
  counterpartFullName: "Vikram Iyer",
  lastMessagePreview: "Happy to refer you.",
  unreadCount: 1,
});

describe("the bell counts brokered activity", () => {
  it("unseen asks, yeses and messages count; read ones and paused kinds don't", () => {
    list.items = [
      message(true),
      { kind: "broker_ask_received", id: "ba:1", occurredAt: at, unseen: true, askId: "a1", requestKind: "referral", askerPersonId: "x", askerFullName: "Asha", company: "Swiggy", roleTitle: null },
      { kind: "broker_request_connected", id: "br-con:2", occurredAt: at, unseen: true, requestId: "r2", requestKind: "hiring", company: "Acme", roleTitle: null, helperPersonId: "h", helperFullName: "Neha" },
      { ...message(false), id: "bm:r3", requestId: "r3" },
      { kind: "connection_thread_reply", id: "ct:1", occurredAt: at, unseen: true, threadId: "t", counterpartyPersonId: "c", counterpartyFullName: "C", lastMessagePreview: "hi" },
    ];
    const { container } = render(
      <MemoryRouter initialEntries={["/home"]}>
        <Nav />
      </MemoryRouter>,
    );
    expect(container.querySelector(".nav__count-badge")?.textContent).toBe("3");
    expect(container.querySelector(".nav__notif-link")?.getAttribute("aria-label")).toBe("Notifications, 3 unread");
  });
});
