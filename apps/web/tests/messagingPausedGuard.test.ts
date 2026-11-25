import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Messaging paused (product decision, 22 Oct 2026): the entire messaging
 * feature is commented out app-wide while staying in the repo for a later
 * revert. This guard fails if any messaging surface silently comes back
 * without deliberately deleting this test.
 */

function sourceWithoutComments(rel: string): string {
  const raw = readFileSync(path.join(process.cwd(), "src", rel), "utf8");
  return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)[^\S\n]*\/\/[^\n]*/g, "$1");
}

describe("messaging paused guard", () => {
  it("keeps the global widget and thread route unmounted", () => {
    const app = sourceWithoutComments("App.tsx");
    expect(app).not.toContain("<GlobalMessagingWidget");
    expect(app).not.toContain('path="/connections/:threadId"');
  });

  it("keeps every Message entry point commented out", () => {
    for (const rel of [
      "pages/Profile.tsx",
      "components/SearchResultRow.tsx",
      "components/CareerIntentFeedRows.tsx",
      "pages/LocationPage.tsx",
    ]) {
      expect(sourceWithoutComments(rel), rel).not.toContain("messaging:open-draft");
    }
  });

  it("keeps the checklist message step and thread deep-links off", () => {
    expect(sourceWithoutComments("components/OnboardingChecklistCard.tsx")).not.toContain("Send your first message");
    expect(sourceWithoutComments("components/NotificationsList.tsx")).not.toContain("/connections/");
  });

  it("keeps message notifications out of the paused panel and badge", () => {
    // One shared filter (isShownNotification) keeps the panel, the badge and the inbox in step.
    const filter = sourceWithoutComments("lib/notificationsQueries.ts");
    expect(filter).toContain('item.kind !== "connection_thread_reply"');
    const widget = sourceWithoutComments("components/GlobalNotificationsWidget.tsx");
    expect(widget).toContain(".filter(isShownNotification)");
    expect(widget).not.toContain("and new messages");
    const nav = sourceWithoutComments("components/Nav.tsx");
    expect(nav).not.toContain("useNotificationsSummary");
    expect(nav).toContain("isShownNotification(item)");
    expect(sourceWithoutComments("pages/NotificationsPage.tsx")).toContain(".filter(isShownNotification)");
  });
});

describe("brokered conversations (the one messaging surface, 25 Nov 2026)", () => {
  it("live only on a connected request's page and use their own limited endpoints", () => {
    expect(sourceWithoutComments("App.tsx")).toContain('path="/requests/:requestId/conversation"');
    for (const rel of ["lib/broker.ts", "components/broker/BrokerConversationThread.tsx", "pages/BrokerConversationPage.tsx"]) {
      expect(sourceWithoutComments(rel), rel).not.toContain("/v1/connection-threads");
      expect(sourceWithoutComments(rel), rel).not.toContain("GlobalMessagingWidget");
    }
  });
});

describe("hidden notification kinds", () => {
  it("hides paused message replies and Cities newcomer offers, shows the rest", async () => {
    const { isShownNotification } = await import("../src/lib/notificationsQueries");
    const item = (kind: string) => ({ kind }) as Parameters<typeof isShownNotification>[0];
    expect(isShownNotification(item("connection_thread_reply"))).toBe(false);
    expect(isShownNotification(item("city_help_offer_received"))).toBe(false);
    expect(isShownNotification(item("broker_ask_received"))).toBe(true);
    expect(isShownNotification(item("broker_request_connected"))).toBe(true);
    expect(isShownNotification(item("broker_message_received"))).toBe(true);
    expect(isShownNotification(item("contact_request_received"))).toBe(true);
  });
});
