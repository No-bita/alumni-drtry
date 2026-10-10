import { describe, expect, it } from "vitest";
import { preflightProfileEdits } from "../src/lib/profileSavePreflight";
import { SOCIAL_PLATFORM_ORDER, type SocialPlatformKey } from "../src/lib/socialLinks";

function links(over: Partial<Record<SocialPlatformKey, string>> = {}) {
  const o = {} as Record<SocialPlatformKey, string>;
  for (const k of SOCIAL_PLATFORM_ORDER) o[k] = "";
  return { ...o, ...over };
}

describe("preflightProfileEdits", () => {
  it("passes with nothing to check", () => {
    expect(preflightProfileEdits([], links())).toBeNull();
  });
  it("passes a good link", () => {
    expect(preflightProfileEdits([], links({ [SOCIAL_PLATFORM_ORDER[0]]: "https://example.com/me" }))).toBeNull();
  });
  it("stops on a bad link before anything is written", () => {
    const msg = preflightProfileEdits([], links({ [SOCIAL_PLATFORM_ORDER[0]]: "not a link at all" }));
    expect(msg).toMatch(/Nothing was saved yet/);
  });
  it("checks the personal email, and allows it to be empty", () => {
    expect(preflightProfileEdits([], links(), "")).toBeNull();
    expect(preflightProfileEdits([], links(), "me@example.com")).toBeNull();
    expect(preflightProfileEdits([], links(), "nope")).toMatch(/Nothing was saved yet/);
  });
  it("stops on an invalid experience", () => {
    const bad = { id: "x", isNew: true, roleTitle: "", organizationName: "", occupationTypeCode: "full_time_employment", startMonth: "", endMonth: "", isCurrent: true };
    expect(preflightProfileEdits([bad], links())).toMatch(/Nothing was saved yet/);
  });
});
