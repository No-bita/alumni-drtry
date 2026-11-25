import type { OccupationView, PublicProfileView } from "../api/client";
import type { OpenToPreferences } from "./openToPreferences";
import { profileDepartmentDisplay, sortOccupationsForDisplay } from "./profileDisplay";

/**
 * One-page profile: what goes in which section. Career and Education come from the same entries
 * (occupations), split by type; the member's own institute program is the first Education item.
 */

/** Entry types shown under Education (an MS, MBA or PhD elsewhere). Everything else is career. */
export const EDUCATION_OCCUPATION_TYPES = ["higher_education_non_research", "phd_research"] as const;

export function isEducationEntry(occ: Pick<OccupationView, "occupationTypeCode">): boolean {
  return (EDUCATION_OCCUPATION_TYPES as readonly string[]).includes(occ.occupationTypeCode);
}

export function splitCareerAndEducation(occupations: OccupationView[]): {
  career: OccupationView[];
  education: OccupationView[];
} {
  const sorted = sortOccupationsForDisplay(occupations);
  return { career: sorted.filter((o) => !isEducationEntry(o)), education: sorted.filter(isEducationEntry) };
}

/** The headline role: the current career entry, else the latest one. Education entries never headline. */
export function headlineRole(occupations: OccupationView[]): OccupationView | null {
  const { career } = splitCareerAndEducation(occupations);
  return career.find((o) => o.isCurrent) ?? null;
}

/** "Senior Business Associate at Meesho", or just the role or the company. */
export function headlineRoleLine(occ: OccupationView | null): string | null {
  if (!occ) return null;
  const role = occ.roleTitle?.trim();
  const org = occ.organizationName?.trim();
  if (role && org) return `${role} at ${org}`;
  return role || org || null;
}

/** "IIT (BHU) Varanasi · Class of 2025". */
export function headlineInstituteLine(profile: Pick<PublicProfileView, "institutionName" | "batchYear">): string | null {
  const parts = [profile.institutionName?.trim(), profile.batchYear ? `Class of ${profile.batchYear}` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export type InstituteEducation = { institution: string | null; program: string | null; years: string | null };

/** The member's own institute program (from the profile, not an entry). */
export function instituteEducation(profile: PublicProfileView, isOwnProfile: boolean): InstituteEducation | null {
  const department = profileDepartmentDisplay(profile, isOwnProfile);
  const degree = (profile.degreeName || profile.degreeCode || "").trim() || null;
  const program = degree && department ? `${degree}, ${department}` : degree || department;
  const years =
    profile.parsedJoiningYear && profile.batchYear
      ? `${profile.parsedJoiningYear} – ${profile.batchYear}`
      : profile.batchYear
        ? `Class of ${profile.batchYear}`
        : null;
  const institution = profile.institutionName?.trim() || null;
  if (!institution && !program && !years) return null;
  return { institution, program, years };
}

/** "github.com/aaryanshah" from "https://www.github.com/aaryanshah/". */
export function displayLinkText(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
}

export type ProfileSection = "header" | "areas" | "openTo" | "career" | "education" | "links" | "contact" | "function";

export type SetupStep = { key: "role" | "function" | "areas" | "openTo"; label: string; done: boolean; section: ProfileSection };

/** The owner's "Finish your profile" list. Hidden once every step is done. */
export function setupSteps(input: {
  occupations: OccupationView[];
  areas: string[];
  openTo: OpenToPreferences | null;
  /** Only passed for the owner; undefined (older API) leaves the step out. */
  jobFunction?: string | null;
}): SetupStep[] {
  return [
    { key: "role", label: "Your current role", done: headlineRole(input.occupations) != null, section: "career" },
    ...(input.jobFunction !== undefined
      ? [{ key: "function" as const, label: "Your function, so hiring requests reach you", done: Boolean(input.jobFunction), section: "function" as const }]
      : []),
    { key: "areas", label: "Areas of experience", done: input.areas.length > 0, section: "areas" },
    { key: "openTo", label: "What you're open to helping with", done: (input.openTo?.selected.length ?? 0) > 0, section: "openTo" },
  ];
}

/** The building photo in the Career card fits only short histories (desktop only, via CSS). */
export const CAREER_PHOTO_MAX_ROLES = 3;
