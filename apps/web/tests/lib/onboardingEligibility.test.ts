import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canAccessOnboardingFlow,
  shouldUseOnboardingFlow,
} from "../../src/lib/onboardingEligibility";

const prof = (o: Record<string, unknown>) => ({ onboardingCompletedAt: null, appLoginCount: 1, role: "alumni", ...o }) as never;

afterEach(() => vi.unstubAllEnvs());

describe("shouldUseOnboardingFlow", () => {
  it("is false once onboarding is complete", () => {
    expect(shouldUseOnboardingFlow(prof({ onboardingCompletedAt: "2026-01-01" }))).toBe(false);
  });
  it("allows up to two logins", () => {
    expect(shouldUseOnboardingFlow(prof({ appLoginCount: 1 }))).toBe(true);
    expect(shouldUseOnboardingFlow(prof({ appLoginCount: 2 }))).toBe(true);
    expect(shouldUseOnboardingFlow(prof({ appLoginCount: 3 }))).toBe(false);
  });
  it("is false when the login count is unknown", () => {
    expect(shouldUseOnboardingFlow(prof({ appLoginCount: null }))).toBe(false);
    expect(shouldUseOnboardingFlow(prof({ appLoginCount: Number.NaN }))).toBe(false);
  });
});

describe("canAccessOnboardingFlow", () => {
  it("never reopens a completed onboarding", () => {
    expect(canAccessOnboardingFlow(prof({ onboardingCompletedAt: "x", appLoginCount: 1 }))).toBe(false);
  });
  it("lets eligible alumni in", () => {
    expect(canAccessOnboardingFlow(prof({}))).toBe(true);
  });
  it("blocks returning incomplete alumni", () => {
    expect(canAccessOnboardingFlow(prof({ appLoginCount: 9 }))).toBe(false);
  });
  it("treats super admins like alumni in every build", () => {
    for (const prod of [true, false]) {
      vi.stubEnv("PROD", prod);
      expect(canAccessOnboardingFlow(prof({ appLoginCount: 9, role: "super_admin" }))).toBe(false);
      expect(canAccessOnboardingFlow(prof({ appLoginCount: 1, role: "super_admin" }))).toBe(true);
    }
  });
});

