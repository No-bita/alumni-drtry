import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRelativeTime } from "../../src/lib/formatRelativeTime";
import {
  avatarLabelFromEmail,
  displayFirstNameFromEmail,
  firstTokenFromEmailLocalPart,
} from "../../src/lib/emailDisplayName";
import { demoDisplayFullName, isDemoProfileBio } from "../../src/lib/demoProfile";
import {
  formatThreadCompactTime,
  formatThreadMessageTime,
  replySnippet,
} from "../../src/lib/threadMessageFormat";

describe("formatRelativeTime", () => {
  const now = new Date("2026-03-10T12:00:00Z");
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("says just now under a minute", () => {
    expect(formatRelativeTime(ago(59_000))).toBe("just now");
  });
  it("uses minutes, hours, then days", () => {
    expect(formatRelativeTime(ago(60_000))).toBe("1m ago");
    expect(formatRelativeTime(ago(59 * 60_000))).toBe("59m ago");
    expect(formatRelativeTime(ago(60 * 60_000))).toBe("1h ago");
    expect(formatRelativeTime(ago(47 * 3_600_000))).toBe("47h ago");
    expect(formatRelativeTime(ago(48 * 3_600_000))).toBe("2d ago");
  });
});

describe("email display names", () => {
  it("takes the first token of the local part", () => {
    expect(firstTokenFromEmailLocalPart("Rahul.Sharma@iitbhu.ac.in")).toBe("rahul");
    expect(firstTokenFromEmailLocalPart("anu_k.mehta@x.in")).toBe("anu");
  });
  it("falls back to there", () => {
    expect(firstTokenFromEmailLocalPart(undefined)).toBe("there");
    expect(firstTokenFromEmailLocalPart("  ")).toBe("there");
    expect(firstTokenFromEmailLocalPart("@x.in")).toBe("there");
    expect(firstTokenFromEmailLocalPart("._@x.in")).toBe("there");
  });
  it("capitalises for greetings and avatars", () => {
    expect(displayFirstNameFromEmail("rahul.s@x.in")).toBe("Rahul");
    expect(displayFirstNameFromEmail(undefined)).toBe("There");
    expect(avatarLabelFromEmail("rahul.s@x.in")).toBe("Rahul");
    expect(avatarLabelFromEmail("")).toBe("You");
  });
});

describe("demo profile helpers", () => {
  it("detects the demo marker in bios", () => {
    expect(isDemoProfileBio("hi [DEMO] there")).toBe(true);
    expect(isDemoProfileBio("real bio")).toBe(false);
    expect(isDemoProfileBio(null)).toBe(false);
  });
  it("strips the demo prefix from names", () => {
    expect(demoDisplayFullName("[DEMO] Asha Rao")).toBe("Asha Rao");
    expect(demoDisplayFullName("  Asha  ")).toBe("Asha");
    expect(demoDisplayFullName("[DEMO]")).toBe("[DEMO]");
    expect(demoDisplayFullName(null)).toBe("");
    expect(demoDisplayFullName("   ")).toBe("");
  });
});

describe("thread message formatting", () => {
  it("collapses whitespace and truncates snippets with an ellipsis", () => {
    expect(replySnippet("a   b\n c")).toBe("a b c");
    const out = replySnippet("x".repeat(200), 10);
    expect(out).toHaveLength(10);
    expect(out.endsWith("…")).toBe(true);
  });
  it("returns empty strings for invalid dates", () => {
    expect(formatThreadMessageTime("nope")).toBe("");
    expect(formatThreadCompactTime("nope")).toBe("");
  });
  it("shows time for today and a date for earlier days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 10, 15, 0, 0));
    const today = formatThreadCompactTime(new Date(2026, 2, 10, 9, 5, 0).toISOString());
    const earlier = formatThreadCompactTime(new Date(2026, 2, 1, 9, 5, 0).toISOString());
    const nineOhFive = new Date(2026, 2, 10, 9, 5, 0);
    const timeOnly = nineOhFive.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    expect(today).toBe(timeOnly);
    expect(earlier).not.toBe(timeOnly);
    expect(formatThreadMessageTime(new Date(2026, 2, 1, 9, 5, 0).toISOString())).toBe(
      new Date(2026, 2, 1, 9, 5, 0).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    );
    vi.useRealTimers();
  });
});
