import type { OccupationView } from "../api/client";
import { api } from "../api/client";

export type OccupationDraft = {
  id: string;
  /** Unsaved row — POST on profile save; can be removed without API delete. */
  isNew: boolean;
  roleTitle: string;
  organizationName: string;
  occupationTypeCode: string;
  startMonth: string;
  endMonth: string;
  isCurrent: boolean;
};

export const PROFILE_OCCUPATION_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "full_time_employment", label: "Full-time" },
  { value: "part_time_employment", label: "Part-time" },
  { value: "freelance_consulting", label: "Freelance" },
  { value: "phd_research", label: "PhD / Research" },
  { value: "postdoctoral_research", label: "Postdoctoral" },
  { value: "founded_venture", label: "Venture" },
  { value: "civil_services_government", label: "Civil services" },
  { value: "military", label: "Military" },
  { value: "higher_education_non_research", label: "Higher education" },
  { value: "sabbatical_career_break", label: "Career break" },
  { value: "other", label: "Other" },
];

export function occupationToDraft(occ: OccupationView): OccupationDraft {
  return {
    id: occ.id,
    isNew: false,
    roleTitle: occ.roleTitle?.trim() ?? "",
    organizationName: occ.organizationName?.trim() ?? "",
    occupationTypeCode: occ.occupationTypeCode,
    startMonth: isoDateToMonthInput(occ.startDate),
    endMonth: isoDateToMonthInput(occ.endDate),
    isCurrent: occ.isCurrent,
  };
}

export function occupationsToDrafts(occupations: OccupationView[]): OccupationDraft[] {
  return occupations.map(occupationToDraft);
}

export function createEmptyOccupationDraft(): OccupationDraft {
  return {
    id: `new-${crypto.randomUUID()}`,
    isNew: true,
    roleTitle: "",
    organizationName: "",
    occupationTypeCode: "full_time_employment",
    startMonth: "",
    endMonth: "",
    isCurrent: false,
  };
}

export function sortOccupationDrafts(drafts: OccupationDraft[]): OccupationDraft[] {
  const sortKey = (d: OccupationDraft): number => {
    const raw = d.isCurrent ? d.startMonth : d.endMonth || d.startMonth;
    if (!raw) return 0;
    const t = Date.parse(`${raw}-01`);
    return Number.isFinite(t) ? t : 0;
  };
  return [...drafts].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return sortKey(b) - sortKey(a);
  });
}

export function isoDateToMonthInput(iso: string | null | undefined): string {
  const raw = iso?.trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0, 7);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return "";
  const d = new Date(parsed);
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${d.getUTCFullYear()}-${month}`;
}

export function monthInputToIsoDate(month: string): string | null {
  const trimmed = month.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return null;
}

export function validateOccupationDraft(draft: OccupationDraft): string | null {
  if (!draft.roleTitle.trim()) return "Role title is required for each experience entry.";
  if (!draft.isCurrent && draft.endMonth && draft.startMonth && draft.endMonth < draft.startMonth) {
    return "End date must be after start date.";
  }
  return null;
}

function buildOccupationWritePayload(draft: OccupationDraft, organizationId: string | null) {
  return {
    roleTitle: draft.roleTitle.trim(),
    occupationTypeCode: draft.occupationTypeCode,
    organizationId,
    startDate: monthInputToIsoDate(draft.startMonth),
    endDate: draft.isCurrent ? null : monthInputToIsoDate(draft.endMonth),
    isCurrent: draft.isCurrent,
  };
}

export function buildOccupationPatchPayload(draft: OccupationDraft, organizationId: string | null) {
  return buildOccupationWritePayload(draft, organizationId);
}

export function buildOccupationCreatePayload(draft: OccupationDraft, organizationId: string | null) {
  return buildOccupationWritePayload(draft, organizationId);
}

const organizationIdCache = new Map<string, string>();

export async function resolveOrganizationId(organizationName: string): Promise<string | null> {
  const trimmed = organizationName.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase();
  const cached = organizationIdCache.get(key);
  if (cached) return cached;

  const { data, error } = await api.post<{ organization?: { id?: string } }>("/v1/orgs/suggest", {
    name: trimmed,
  });
  if (error) {
    throw new Error(error.message ?? error.code);
  }
  const id = data?.organization?.id;
  if (!id) {
    throw new Error("Could not create or resolve organization.");
  }
  organizationIdCache.set(key, id);
  return id;
}

export function clearOrganizationIdCache(): void {
  organizationIdCache.clear();
}
