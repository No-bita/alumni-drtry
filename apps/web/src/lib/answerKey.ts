import type { OpenToOptionId } from "./openToPreferences";

/**
 * "Answer key" = the Open-to tags framed by the questions they route to you.
 * Each example is the kind of question that tag is for; Ask → Match boosts alumni with the
 * matching tag (see CATEGORY_OPEN_TO in apps/api/src/lib/matchScore.ts). "speaking" is not used
 * by matching today.
 */
export const ANSWER_KEY_EXAMPLES: Record<OpenToOptionId, string> = {
  referrals: "“Referral for a role at your company”",
  hiring: "“Who’s hiring for my profile at your company?”",
  mentorship: "“Interview prep for your kind of role”",
  coffee: "“How did you switch into what you do now?”",
  advising: "“Feedback on my startup idea”",
  collaboration: "“Looking for a co-founder or project partner”",
  intros: "“Can you introduce me to someone in your network?”",
  speaking: "“Would you speak at a campus session?”",
  city_help: "“Moving to your city — where should I live?”",
  study_advice: "“MS or MBA? Which programmes should I look at?”",
};

/** Order shown in onboarding: the tags Ask → Match uses most come first. */
export const ANSWER_KEY_ORDER: readonly OpenToOptionId[] = [
  "referrals",
  "mentorship",
  "coffee",
  "city_help",
  "study_advice",
  "advising",
  "collaboration",
  "hiring",
  "intros",
  "speaking",
];

export const PAST_ROLE_SLOTS = 2;

export type PastRoleDraft = { company: string; role: string };

export function emptyPastRoles(): PastRoleDraft[] {
  return Array.from({ length: PAST_ROLE_SLOTS }, () => ({ company: "", role: "" }));
}

/** A row counts only when both fields are filled; a half-filled row is an error, an empty row is skipped. */
export function pastRolesError(rows: readonly PastRoleDraft[]): string | null {
  for (const r of rows) {
    const c = r.company.trim();
    const t = r.role.trim();
    if ((c && !t) || (!c && t)) return "Add both the company and the role, or leave the row empty.";
  }
  return null;
}

export function completePastRoles(rows: readonly PastRoleDraft[]): PastRoleDraft[] {
  const seen = new Set<string>();
  const out: PastRoleDraft[] = [];
  for (const r of rows) {
    const company = r.company.trim();
    const role = r.role.trim();
    if (!company || !role) continue;
    const key = `${company.toLowerCase()}|${role.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ company: company.slice(0, 200), role: role.slice(0, 200) });
  }
  return out;
}

export function pastRoleKey(r: PastRoleDraft): string {
  return `${r.company.trim().toLowerCase()}|${r.role.trim().toLowerCase()}`;
}
