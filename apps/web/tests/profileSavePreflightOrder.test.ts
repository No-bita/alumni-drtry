import { describe, expect, it } from "vitest";
import { preflightProfileEdits } from "../src/lib/profileSavePreflight";
import { SOCIAL_PLATFORM_ORDER, type SocialPlatformKey } from "../src/lib/socialLinks";

const draft = (o: Record<string, unknown> = {}) =>
  ({ id: "x", isNew: true, roleTitle: "Engineer", organizationName: "", occupationTypeCode: "full_time_employment", startMonth: "2020-01", endMonth: "2021-01", isCurrent: false, ...o }) as never;
const links = (over: Partial<Record<SocialPlatformKey, string>> = {}) => {
  const o = {} as Record<SocialPlatformKey, string>;
  for (const k of SOCIAL_PLATFORM_ORDER) o[k] = "";
  return { ...o, ...over };
};

describe("preflightProfileEdits ordering and details", () => {
  it("accepts a clean edit", () => {
    expect(preflightProfileEdits([draft()], links({ linkedin: "linkedin.com/in/me" }), "me@example.com")).toBeNull();
  });
  it("reports the email problem first", () => {
    const msg = preflightProfileEdits([draft({ roleTitle: "" })], links({ github: "bad link" }), "nope");
    expect(msg).toMatch(/personal email/);
  });
  it("then the first bad experience, with its own reason", () => {
    expect(preflightProfileEdits([draft({ roleTitle: " " })], links({ github: "bad link" }))).toMatch(/Role title is required/);
    expect(preflightProfileEdits([draft({ startMonth: "2022-01", endMonth: "2021-01" })], links())).toMatch(/End date must be after start date/);
  });
  it("lets a current role skip the end date check", () => {
    expect(preflightProfileEdits([draft({ isCurrent: true, startMonth: "2022-01", endMonth: "2021-01" })], links())).toBeNull();
  });
  it("names the platform with the bad link", () => {
    expect(preflightProfileEdits([], links({ twitter: "exa mple" }))).toMatch(/Twitter link/);
    expect(preflightProfileEdits([], links({ github: "exa mple" }))).toMatch(/GitHub link/);
  });
  it("checks every experience, not just the first", () => {
    expect(preflightProfileEdits([draft(), draft({ roleTitle: "" })], links())).toMatch(/Role title/);
  });
  it("trims whitespace-only emails and links to nothing", () => {
    expect(preflightProfileEdits([], links({ github: "   " }), "   ")).toBeNull();
  });
  it("never claims anything was saved", () => {
    const msgs = [
      preflightProfileEdits([], links(), "x"),
      preflightProfileEdits([draft({ roleTitle: "" })], links()),
      preflightProfileEdits([], links({ linkedin: "a b" })),
    ];
    for (const m of msgs) expect(m).toMatch(/Nothing was saved yet/);
  });
});
