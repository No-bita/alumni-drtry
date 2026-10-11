import { describe, expect, it } from "vitest";
import {
  emptySocialLinkDraft,
  linkToSocialPlatformKey,
  normalizeSocialUrl,
  otherProfileLinks,
  socialLinksByPlatform,
  socialLinksDraftFromProfile,
  socialPlatformLabel,
} from "../../src/lib/socialLinks";

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

describe("social link collections", () => {
  const links = [
    link("LinkedIn", "https://linkedin.com/in/a"),
    link("Portfolio", "https://me.dev"),
    link("GitHub", "https://github.com/a"),
    link("GitHub", "https://github.com/second"),
  ];

  it("builds a draft with blanks for missing platforms", () => {
    expect(socialLinksDraftFromProfile(links)).toEqual({
      linkedin: "https://linkedin.com/in/a",
      github: "https://github.com/second",
      twitter: "",
    });
    expect(socialLinksDraftFromProfile([])).toEqual(emptySocialLinkDraft());
  });

  it("keeps non-social links separate", () => {
    expect(otherProfileLinks(links)).toHaveLength(1);
  });

  it("keeps the first link per platform", () => {
    const map = socialLinksByPlatform(links);
    expect(map.get("github")?.url).toBe("https://github.com/a");
    expect(map.has("twitter")).toBe(false);
  });

  it("labels platforms", () => {
    expect(socialPlatformLabel("twitter")).toBe("Twitter");
  });
});

describe("normalizeSocialUrl", () => {
  it("returns null for blank input", () => {
    expect(normalizeSocialUrl("")).toBeNull();
    expect(normalizeSocialUrl("   ")).toBeNull();
  });
  it("adds https when the scheme is missing", () => {
    expect(normalizeSocialUrl(" github.com/me ")).toBe("https://github.com/me");
  });
  it("keeps an explicit http scheme", () => {
    expect(normalizeSocialUrl("http://example.com")).toBe("http://example.com/");
  });
  it("returns null for unparseable input", () => {
    expect(normalizeSocialUrl("http://")).toBeNull();
    expect(normalizeSocialUrl("exa mple.com")).toBeNull();
  });
});
