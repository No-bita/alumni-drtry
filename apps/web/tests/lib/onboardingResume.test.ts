import { describe, expect, it } from "vitest";
import { canAccessOnboardingFlow, canResumeOnboarding } from "../../src/lib/onboardingEligibility";

const base = { role: "alumni" as const, onboardingCompletedAt: null };

describe("canResumeOnboarding", () => {
  it("lets a returning incomplete member back in after the login cap", () => {
    const profile = { ...base, appLoginCount: 3 };
    expect(canAccessOnboardingFlow(profile, undefined)).toBe(false);
    expect(canResumeOnboarding(profile, undefined)).toBe(true);
  });

  it("still allows a first-time incomplete member", () => {
    expect(canResumeOnboarding({ ...base, appLoginCount: 1 }, undefined)).toBe(true);
  });

  it("blocks a member who already finished onboarding", () => {
    expect(
      canResumeOnboarding({ ...base, appLoginCount: 5, onboardingCompletedAt: "2026-01-01T00:00:00Z" }, undefined)
    ).toBe(false);
  });
});
