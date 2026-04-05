import { isSuperAdmin, type MePerson, type MyProfileView } from "../api/client";

/**
 * Incomplete users may use `/onboarding` for this many successful logins (OTP/magic link), then use returning-incomplete rules (`/home`).
 * Matches API `people.app_login_count` after each verify.
 */
const ONBOARDING_ELIGIBLE_LOGIN_CAP = 2;

/**
 * In **production**, super admins skip profile gates and onboarding redirects (fast path to the app).
 * In **development**, they follow the same journey as alumni so flows can be exercised.
 */
export function superAdminSkipsAlumniJourney(person: MePerson | undefined | null): boolean {
  return isSuperAdmin(person) && import.meta.env.PROD;
}

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
 * Whether `/onboarding` may run for this profile: login-cap eligibility (`shouldUseOnboardingFlow`), or dev
 * `super_admin` with incomplete onboarding (see `canAccessOnboardingFlow`).
 */
function isSuperAdminFromProfileOrSession(
  profile: Pick<MyProfileView, "role">,
  person: MePerson | undefined | null
): boolean {
  return isSuperAdmin(person) || profile.role === "super_admin";
}

/**
 * Super admins may open `/onboarding` in non-production so flows can be tested.
 * Uses `profile.role` as well as session `person` so eligibility is correct even if `/v1/me` is stale.
 */
export function canAccessOnboardingFlow(
  profile: Pick<MyProfileView, "onboardingCompletedAt" | "appLoginCount" | "role">,
  person: MePerson | undefined | null
): boolean {
  if (profile.onboardingCompletedAt) return false;
  if (shouldUseOnboardingFlow(profile)) return true;
  if (!isSuperAdminFromProfileOrSession(profile, person)) return false;
  return !import.meta.env.PROD;
}
