import { describe, expect, it } from "vitest";
import { linkToSocialPlatformKey } from "../../src/lib/socialLinks";

const link = (platform: string, url: string) => ({ platform, url }) as never;

describe("linkToSocialPlatformKey", () => {
  it.each([
    ["LinkedIn", "https://x.test/a", "linkedin"],
    ["Profile", "https://www.linkedin.com/in/me", "linkedin"],
    ["GitHub", "https://x.test", "github"],
    ["site", "https://github.com/me", "github"],
    ["Twitter", "https://x.test", "twitter"],
    ["X", "https://x.test", "twitter"],
    ["X/Twitter", "https://x.test", "twitter"],
    ["site", "https://twitter.com/me", "twitter"],
    ["site", "https://x.com/me", "twitter"],
  ])("maps %s %s to %s", (platform, url, expected) => {
    expect(linkToSocialPlatformKey(link(platform, url))).toBe(expected);
  });

  it("returns null for unrelated links", () => {
    expect(linkToSocialPlatformKey(link("Portfolio", "https://me.dev"))).toBeNull();
  });
});
