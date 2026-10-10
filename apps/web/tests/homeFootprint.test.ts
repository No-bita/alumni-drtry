import { describe, expect, it } from "vitest";
import type { IntentcastFeedItem } from "../src/api/client";
import { buildFootprint, expiryState } from "../src/lib/homeFootprint";

const NOW = Date.parse("2026-10-10T10:00:00Z");
const hours = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

function post(over: Partial<IntentcastFeedItem> = {}): IntentcastFeedItem {
  return {
    id: "p1",
    authorPersonId: "me",
    authorFullName: "Me",
    authorDepartmentCode: "CSE",
    authorDepartmentName: "Computer Science",
    category: "hiring",
    content: "Looking for a referral at Razorpay\nBackend, 2 years",
    status: "open",
    expiresAt: hours(24 * 5 + 2),
    closedAt: null,
    createdAt: hours(-5),
    editableUntil: hours(-4),
    responseCount: 0,
    viewerHasResponded: false,
    ...over,
  };
}

describe("expiryState", () => {
  it("counts days, then hours, then the last hour", () => {
    expect(expiryState(hours(24 * 5 + 2), NOW)).toEqual({ label: "Live for 5 more days", tone: "ok" });
    expect(expiryState(hours(30), NOW)).toEqual({ label: "Last call: 30 hours left", tone: "soon" });
    expect(expiryState(hours(1.5), NOW)).toEqual({ label: "Last call: 1 hour left", tone: "soon" });
    expect(expiryState(hours(0.4), NOW)).toEqual({ label: "Last call: under an hour left", tone: "soon" });
  });
  it("returns null once expired or invalid", () => {
    expect(expiryState(hours(-1), NOW)).toBeNull();
    expect(expiryState("not a date", NOW)).toBeNull();
  });
});

describe("buildFootprint", () => {
  it("renders nothing when there are no live posts and no replies", () => {
    expect(buildFootprint([], 0, "me", NOW)).toBeNull();
  });
  it("keeps only my open, live, not-removed posts, newest first", () => {
    const fp = buildFootprint(
      [
        post({ id: "old", createdAt: hours(-48) }),
        post({ id: "new", createdAt: hours(-1) }),
        post({ id: "closed", status: "closed" }),
        post({ id: "closedAt", closedAt: hours(-2) }),
        post({ id: "removed", authorSoftDeletedAt: hours(-3) }),
        post({ id: "expired", expiresAt: hours(-1) }),
        post({ id: "theirs", authorPersonId: "other" }),
      ],
      0,
      "me",
      NOW
    );
    expect(fp?.posts.map((p) => p.id)).toEqual(["new", "old"]);
    expect(fp?.replyCount).toBe(0);
  });
  it("shows the strip for replies alone, and clamps a bad count", () => {
    expect(buildFootprint([], 3, "me", NOW)).toEqual({ posts: [], replyCount: 3 });
    expect(buildFootprint([], -2, "me", NOW)).toBeNull();
  });
  it("carries a readable title, expiry state and per-post reply count", () => {
    const fp = buildFootprint([post({ responseCount: 2, expiresAt: hours(5) })], 2, "me", NOW);
    expect(fp?.posts[0]).toMatchObject({ expiryLabel: "Last call: 5 hours left", expiryTone: "soon", responseCount: 2 });
    expect(fp?.posts[0]?.title.length).toBeGreaterThan(0);
  });
});
