import type { MyProfileView } from "../api/client";

type MinimumProfile = Partial<Pick<MyProfileView, "fullName" | "departmentCode" | "degreeCode" | "batchYear">>;

/** The four required values, not login counts or completion timestamps, unlock the basic flow. */
export function hasMinimumProfile(profile: MinimumProfile): boolean {
  const year = profile.batchYear;
  return Boolean(
    profile.fullName?.trim() && profile.departmentCode?.trim() && profile.degreeCode?.trim() &&
    typeof year === "number" && Number.isInteger(year) && year >= 1960 && year <= new Date().getFullYear() + 5
  );
}

export function shouldUseOnboardingFlow(profile: MinimumProfile): boolean {
  return !hasMinimumProfile(profile);
}

export function canAccessOnboardingFlow(profile: MinimumProfile): boolean {
  return shouldUseOnboardingFlow(profile);
}

/** Optional enrichment can still be resumed through the existing onboarding screens. */
export function canResumeOnboarding(profile: MinimumProfile & Pick<MyProfileView, "onboardingCompletedAt">): boolean {
  return !hasMinimumProfile(profile) || !profile.onboardingCompletedAt;
}
