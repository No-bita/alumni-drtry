/** Canonical Career hub URL — single scrollable page (hiring, referrals, mentorship). */
export const CAREER_INTENT_DEFAULT_PATH = "/intent/career";

/** `id` on the referrals directory region in {@link CareerPage}. */
export const CAREER_REFERRALS_SECTION_ID = "referrals";

export function careerPageReferralsHref(): string {
  return `${CAREER_INTENT_DEFAULT_PATH}#${CAREER_REFERRALS_SECTION_ID}`;
}
