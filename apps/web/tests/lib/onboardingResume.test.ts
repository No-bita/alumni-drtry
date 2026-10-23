import { describe, expect, it, vi } from "vitest";
import { canAccessOnboardingFlow, canResumeOnboarding } from "../../src/lib/onboardingEligibility";

const base = { role: "alumni" as const, onboardingCompletedAt: null };

describe("canResumeOnboarding", () => {
  it("lets a returning incomplete member back in after the login cap", () => {
    const profile = { ...base, appLoginCount: 3 };
    expect(canAccessOnboardingFlow(profile)).toBe(false);
    expect(canResumeOnboarding(profile)).toBe(true);
  });

  it("still allows a first-time incomplete member", () => {
    expect(canResumeOnboarding({ ...base, appLoginCount: 1 })).toBe(true);
  });

  it("blocks a member who already finished onboarding", () => {
    expect(
      canResumeOnboarding({ ...base, appLoginCount: 5, onboardingCompletedAt: "2026-01-01T00:00:00Z" })
    ).toBe(false);
  });

  it("offers resume to super admins exactly like alumni, in every build", () => {
    for (const prod of [true, false]) {
      vi.stubEnv("PROD", prod);
      expect(canResumeOnboarding({ ...base, role: "super_admin" as const, appLoginCount: 9 })).toBe(true);
    }
    vi.unstubAllEnvs();
  });
});
