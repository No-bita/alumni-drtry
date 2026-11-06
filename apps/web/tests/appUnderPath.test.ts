import { afterEach, describe, expect, it } from "vitest";
import { APP_BASE_PATH, appBaseUrl, publicAsset, stripAppBase } from "../src/lib/appBase";
import { rememberReturnTo, safeReturnPath, takeReturnTo } from "../src/lib/returnTo";
import { buildInviteLink } from "../src/lib/inviteLink";

describe("app served under /app", () => {
  it("the app's base comes from Vite's base (/app)", () => {
    expect(APP_BASE_PATH).toBe("/app");
  });

  it("public files, share links and analytics routes respect the base", () => {
    expect(publicAsset("media/camp_1.jpeg")).toBe("/app/media/camp_1.jpeg");
    expect(publicAsset("/favicon.svg")).toBe("/app/favicon.svg");
    expect(appBaseUrl("https://almamatter.in")).toBe("https://almamatter.in/app");
    expect(buildInviteLink(appBaseUrl("https://almamatter.in"), "p1", "copy")).toBe("https://almamatter.in/app/login?ref=p1&ch=copy");
    expect(stripAppBase("/app/profiles/1")).toBe("/profiles/1");
    expect(stripAppBase("/app")).toBe("/");
    expect(stripAppBase("/application")).toBe("/application");
  });
});

describe("return to the page after signing in", () => {
  afterEach(() => window.localStorage.clear());

  it("only in-app paths; never another site and never the sign-in screens (no loops)", () => {
    expect(safeReturnPath("/profiles/123?tab=a")).toBe("/profiles/123?tab=a");
    expect(safeReturnPath("//evil.com/x")).toBeNull();
    expect(safeReturnPath("/\\evil.com")).toBeNull();
    expect(safeReturnPath("https://evil.com")).toBeNull();
    expect(safeReturnPath("/login")).toBeNull();
    expect(safeReturnPath("/login?next=/x")).toBeNull();
    expect(safeReturnPath("/auth/verify?x=1")).toBeNull();
    expect(safeReturnPath("/onboarding")).toBeNull();
    expect(safeReturnPath("/w/abc")).toBeNull();
    expect(safeReturnPath("/")).toBeNull();
    expect(safeReturnPath("/home\u0000")).toBeNull();
  });

  it("remembered once, then cleared; expires after 30 minutes", () => {
    rememberReturnTo("/intent/career/company?name=Swiggy");
    expect(takeReturnTo()).toBe("/intent/career/company?name=Swiggy");
    expect(takeReturnTo()).toBeNull();
    window.localStorage.setItem("alma.returnTo", JSON.stringify({ path: "/home", at: Date.now() - 31 * 60 * 1000 }));
    expect(takeReturnTo()).toBeNull();
  });
});
