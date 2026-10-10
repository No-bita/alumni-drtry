import { describe, expect, it } from "vitest";
import { AppError, isAppError } from "../src/lib/errors.js";
import { generateOpaqueToken, generateOtp, hashSecret, verifySecret } from "../src/lib/crypto.js";
import { fingerprintCanonicalMerge, fingerprintUnmapped } from "../src/lib/locationCleanupFingerprint.js";
import { normalizePlaceAlias } from "../src/lib/canonicalPlacesNormalize.js";
import { personRowIsDemoProfile } from "../src/lib/demoPersonProfile.js";
import { BETA_USAGE_EVENT_TYPES } from "../src/lib/betaUsageEventTypes.js";

describe("AppError", () => {
  it("carries status, code and exposure defaults", () => {
    const e = new AppError(404, "NOT_FOUND", "nope");
    expect(e).toBeInstanceOf(Error);
    expect(e).toMatchObject({ statusCode: 404, code: "NOT_FOUND", message: "nope", expose: true });
    expect(e.retryAfterSeconds).toBeUndefined();
  });
  it("carries retry-after for rate limits", () => {
    expect(new AppError(429, "RL", "slow", true, 12).retryAfterSeconds).toBe(12);
  });
  it("is detected by isAppError only", () => {
    expect(isAppError(new AppError(400, "X", "x"))).toBe(true);
    expect(isAppError(new Error("x"))).toBe(false);
    expect(isAppError(null)).toBe(false);
  });
});

describe("crypto helpers", () => {
  it("generates numeric OTPs of the requested length", () => {
    expect(generateOtp()).toMatch(/^\d{6}$/);
    expect(generateOtp(4)).toMatch(/^\d{4}$/);
  });
  it("generates distinct url-safe tokens", () => {
    const a = generateOpaqueToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(generateOpaqueToken());
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
  });
  it("hashes deterministically per pepper", () => {
    expect(hashSecret("s", "pepper-aaaaaaaaaaaa")).toBe(hashSecret("s", "pepper-aaaaaaaaaaaa"));
    expect(hashSecret("s", "pepper-aaaaaaaaaaaa")).not.toBe(hashSecret("s", "pepper-bbbbbbbbbbbb"));
    expect(hashSecret("s", "p")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("verifies secrets and rejects wrong ones or malformed hashes", () => {
    const pepper = "pepper-aaaaaaaaaaaa";
    const h = hashSecret("123456", pepper);
    expect(verifySecret("123456", h, pepper)).toBe(true);
    expect(verifySecret("654321", h, pepper)).toBe(false);
    expect(verifySecret("123456", h, "other-pepper-xxxxx")).toBe(false);
    expect(verifySecret("123456", "abcd", pepper)).toBe(false);
  });
});

describe("location cleanup helpers", () => {
  it("fingerprints merges regardless of argument order", () => {
    expect(fingerprintCanonicalMerge("b", "a")).toBe("merge:a:b");
    expect(fingerprintCanonicalMerge("a", "b")).toBe(fingerprintCanonicalMerge("b", "a"));
  });
  it("fingerprints unmapped places", () => {
    expect(fingerprintUnmapped("india", "pune")).toBe("raw:india:pune");
  });
  it("normalises place aliases", () => {
    expect(normalizePlaceAlias("  New   YORK ")).toBe("new york");
    expect(normalizePlaceAlias("")).toBe("");
  });
});

describe("personRowIsDemoProfile", () => {
  const p = (email: string, t = false) => ({ is_test_user: t, institutional_email: email });
  it("flags test users", () => expect(personRowIsDemoProfile(p("a@x.in", true))).toBe(true));
  it("flags demo local parts, case-insensitively", () => {
    expect(personRowIsDemoProfile(p("BatchDemo.one@x.in"))).toBe(true);
    expect(personRowIsDemoProfile(p("platformdemo.two@x.in"))).toBe(true);
  });
  it("does not flag real alumni or malformed emails", () => {
    expect(personRowIsDemoProfile(p("rahul.cse19@x.in"))).toBe(false);
    expect(personRowIsDemoProfile(p("nodomain"))).toBe(false);
    expect(personRowIsDemoProfile(p("@batchdemo.x"))).toBe(false);
  });
});

describe("beta usage event types", () => {
  it("has no duplicates and snake_case names", () => {
    expect(new Set(BETA_USAGE_EVENT_TYPES).size).toBe(BETA_USAGE_EVENT_TYPES.length);
    for (const t of BETA_USAGE_EVENT_TYPES) expect(t).toMatch(/^[a-z]+(_[a-z]+)+$/);
  });
});
