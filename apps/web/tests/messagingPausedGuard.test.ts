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
});
