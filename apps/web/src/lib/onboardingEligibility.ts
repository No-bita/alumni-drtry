import type { MyProfileView } from "../api/client";

/**
 * Incomplete users may use `/onboarding` for this many successful logins (OTP/magic link), then use returning-incomplete rules (`/home`).
 * Matches API `people.app_login_count` after each verify.
 */
const ONBOARDING_ELIGIBLE_LOGIN_CAP = 2;

/**
 * True when the user may still be routed through `/onboarding` (funnel not finished).
 * Uses login cap: after `ONBOARDING_ELIGIBLE_LOGIN_CAP` auths, users follow returning rules → `/home`.
 * Full funnel completion is `onboardingCompletedAt` (all steps); minimum directory eligibility is `profileCompletedAt` (step 2).
 */
export function shouldUseOnboardingFlow(
  profile: Pick<MyProfileView, "onboardingCompletedAt" | "appLoginCount">
): boolean {
  if (profile.onboardingCompletedAt) return false;
  const n = profile.appLoginCount;
  if (n == null || Number.isNaN(n)) return false;
  return n <= ONBOARDING_ELIGIBLE_LOGIN_CAP;
}

/**
 * Whether `/onboarding` may run for this profile: login-cap eligibility (`shouldUseOnboardingFlow`).
 * Every role follows the same rule.
 */
export function canAccessOnboardingFlow(
  profile: Pick<MyProfileView, "onboardingCompletedAt" | "appLoginCount">
): boolean {
  return shouldUseOnboardingFlow(profile);
}

/**
 * Whether an incomplete member may open `/onboarding` on their own (e.g. from the account menu), even after the
 * login cap. The cap only decides automatic redirects; it must not lock members out of finishing their profile.
 */
export function canResumeOnboarding(profile: Pick<MyProfileView, "onboardingCompletedAt">): boolean {
  return !profile.onboardingCompletedAt;
}
