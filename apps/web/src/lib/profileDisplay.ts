import type { OccupationView, PublicProfileView, SearchProfileView } from "../api/client";
import { formatBatchYearShort } from "./bulletinPostCardUtils";

/** First current occupation, else first in list. */
export function currentOccupation(occupations: OccupationView[]): OccupationView | null {
  if (occupations.length === 0) return null;
  return occupations.find((o) => o.isCurrent) ?? occupations[0] ?? null;
}

export function roleOrgPartsFromOccupation(
  occ: OccupationView | null,
): { role: string; org: string | null } | null {
  if (!occ) return null;
  const role = occ.roleTitle?.trim();
  if (!role) return null;
  const org = occ.organizationName?.trim() || null;
  return { role, org };
}

export function roleOrgLineFromOccupation(occ: OccupationView | null): string | null {
  const parts = roleOrgPartsFromOccupation(occ);
  if (!parts) return null;
  if (parts.org) return `${parts.role} @ ${parts.org}`;
  return parts.role;
}

export function roleOrgLineFromSearchProfile(profile: SearchProfileView): string | null {
  if (profile.headlineRoleTitle && profile.headlineOrganizationName) {
    return `${profile.headlineRoleTitle} @ ${profile.headlineOrganizationName}`;
  }
  if (profile.headlineRoleTitle) return profile.headlineRoleTitle;
  return null;
}

/** Hero education line, e.g. "BTech, Civil Engineering · Class of '22". */
export function profileEducationHeadlineLine(
  profile: Pick<
    PublicProfileView,
    "degreeCode" | "degreeName" | "departmentCode" | "departmentName" | "batchYear"
  > | null | undefined,
  departmentCodeFallback?: string | null,
): string | null {
  if (!profile) return null;

  const degree = profile.degreeName?.trim() || profile.degreeCode?.trim() || null;
  const department =
    profile.departmentName?.trim() ||
    departmentCodeFallback?.trim().toUpperCase() ||
    profile.departmentCode?.trim().toUpperCase() ||
    null;

  const studyParts: string[] = [];
  if (degree && department) studyParts.push(`${degree}, ${department}`);
  else if (degree) studyParts.push(degree);
  else if (department) studyParts.push(department);

  const hasBatch = typeof profile.batchYear === "number" && Number.isFinite(profile.batchYear);
  const batchPart = hasBatch ? `Class of ${formatBatchYearShort(profile.batchYear as number)}` : null;

  if (studyParts.length > 0 && batchPart) return `${studyParts[0]} · ${batchPart}`;
  if (studyParts.length > 0) return studyParts[0];
  return batchPart;
}

export function residenceLine(
  city: string | null | undefined,
  country: string | null | undefined,
): string | null {
  const c = city?.trim();
  const co = country?.trim();
  if (c && co) return `${c}, ${co}`;
  if (c) return c;
  if (co) return co;
  return null;
}

function occupationSortKey(occ: OccupationView): number {
  const date = occ.isCurrent ? occ.startDate : occ.endDate ?? occ.startDate;
  if (!date) return 0;
  const t = Date.parse(date);
  return Number.isFinite(t) ? t : 0;
}

/** Current first, then most recent by end/start date. */
export function sortOccupationsForDisplay(occupations: OccupationView[]): OccupationView[] {
  return [...occupations].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return occupationSortKey(b) - occupationSortKey(a);
  });
}

function formatOccupationMonthYear(iso: string | null | undefined): string | null {
  const raw = iso?.trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    const year = raw.slice(0, 4);
    return year || null;
  }
  return new Date(parsed).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function formatOccupationPeriod(occ: OccupationView): string {
  const start = formatOccupationMonthYear(occ.startDate);
  const end = occ.isCurrent ? "Present" : formatOccupationMonthYear(occ.endDate);

  if (start && end) return `${start} – ${end}`;
  if (start) return start;
  if (occ.isCurrent) return "Present";
  if (end) return end;
  return "—";
}

const OCCUPATION_EMPLOYMENT_LABELS: Record<string, string> = {
  full_time_employment: "Full-time",
  part_time_employment: "Part-time",
  freelance_consulting: "Freelance",
  phd_research: "PhD / Research",
  postdoctoral_research: "Postdoctoral",
  founded_venture: "Venture",
  civil_services_government: "Civil services",
  military: "Military",
  higher_education_non_research: "Higher education",
  sabbatical_career_break: "Career break",
  other: "Other",
};

function parseOccupationDate(iso: string | null | undefined): Date | null {
  const raw = iso?.trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

/** Short employment type label (e.g. "Full-time"). */
export function formatOccupationEmploymentLabel(occ: OccupationView): string | null {
  const mapped = OCCUPATION_EMPLOYMENT_LABELS[occ.occupationTypeCode];
  if (mapped) return mapped;
  const name = occ.occupationTypeName?.trim();
  return name || null;
}

/** Tenure length (e.g. "1 yr", "6 mos"). */
export function formatOccupationDuration(
  occ: OccupationView,
  referenceDate: Date = new Date(),
): string | null {
  const start = parseOccupationDate(occ.startDate);
  if (!start) return null;
  const end = occ.isCurrent ? referenceDate : parseOccupationDate(occ.endDate);
  if (!end) return null;

  let totalMonths =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (totalMonths < 0) return null;
  if (totalMonths < 1) return null;

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  if (years >= 1 && months === 0) return years === 1 ? "1 yr" : `${years} yrs`;
  if (years >= 1) return years === 1 ? "1 yr" : `${years} yrs`;
  if (months === 1) return "1 mo";
  return `${months} mos`;
}

/** Company · employment type (e.g. "Meesho · Full-time"). */
export function formatOccupationCompanyTypeLine(occ: OccupationView): string | null {
  const org = occ.organizationName?.trim() || null;
  const employment = formatOccupationEmploymentLabel(occ);
  if (org && employment) return `${org} · ${employment}`;
  return org ?? employment;
}

/** Month range · tenure (e.g. "Jun 2025 – Present · 1 yr"). */
export function formatOccupationDatesDurationLine(occ: OccupationView): string | null {
  const period = formatOccupationPeriod(occ);
  if (!period || period === "—") return null;
  const duration = formatOccupationDuration(occ);
  if (duration) return `${period} · ${duration}`;
  return period;
}

/** Work location for current role when no per-occupation location exists (uses profile residence). */
export function occupationWorkLocationLine(
  occ: OccupationView,
  residence: { city?: string | null; country?: string | null } | null | undefined,
): string | null {
  if (!occ.isCurrent || !residence) return null;
  return residenceLine(residence.city, residence.country);
}

/** Date range with optional location segment (e.g. "Jun 2023 – Present · Bengaluru, India"). */
export function formatOccupationMetaLine(occ: OccupationView, location?: string | null): string {
  const period = formatOccupationPeriod(occ);
  const loc = location?.trim();
  return loc ? `${period} · ${loc}` : period;
}
