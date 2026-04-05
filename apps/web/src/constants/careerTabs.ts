/** URL segments under `/intent/career/:careerTab` */
export const CAREER_TAB_SEGMENTS = ["opportunities", "referrals", "post"] as const;

export type CareerTabSegment = (typeof CAREER_TAB_SEGMENTS)[number];

export function isCareerTabSegment(value: string | undefined): value is CareerTabSegment {
  return value !== undefined && (CAREER_TAB_SEGMENTS as readonly string[]).includes(value);
}

export function careerIntentPath(segment: CareerTabSegment): string {
  return `/intent/career/${segment}`;
}

/** Redirect target for bare `/intent/career` */
export const CAREER_INTENT_DEFAULT_PATH = careerIntentPath("opportunities");
