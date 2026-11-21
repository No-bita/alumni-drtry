import { env } from "../config/env.js";
import { DOMAIN_DIRECTORY, parseAllowedDomains } from "./domainAllowlist.js";

/**
 * Wall post audience (who can see a post), chosen at creation and fixed afterwards.
 *
 * - Institute: one institute, or none = all institutes (the default). Any allowed institute can be
 *   picked, not only the author's own.
 * - Batch, department, city: the AUTHOR's own value, copied at posting time. They match across all
 *   institutes unless an institute is also picked.
 * - Everything picked must match (AND). Nothing picked = Everyone.
 * - The client only says WHAT is picked; values always come from the database.
 */

export type AudiencePart = "institution" | "batch" | "department" | "city";

/** What the composer sends. Missing or all-empty = Everyone. */
export interface AudienceInput {
  /** Institute key from {@link listInstitutions}; null or missing = all institutes. */
  institution?: string | null;
  batch?: boolean;
  department?: boolean;
  city?: boolean;
}

export interface InstitutionOption {
  key: string;
  name: string;
  domains: string[];
}

/** The copy stored on a post (migration 067). All null = Everyone. */
export interface AudienceSnapshot {
  emailDomains: string[] | null;
  institutionName: string | null;
  batchYear: number | null;
  departmentCode: string | null;
  departmentName: string | null;
  placeId: string | null;
}

/** Why the author can't use one of their own details. */
export type AudienceUnavailableReason =
  | "missing" // nothing on the profile
  | "pending_review" // department typed in as "Other", waiting for review
  | "other_department" // an approved "Other" department: no shared code to match on
  | "city_not_linked" // a city typed in but not linked to a known city
  | "city_pending"; // linked to a city that is still waiting for review

/** The author's own details, as the database has them now. */
export interface AuthorAudienceFacts {
  batchYear: number | null;
  departmentCode: string | null;
  departmentName: string | null;
  departmentUnavailable: AudienceUnavailableReason | null;
  placeId: string | null;
  placeName: string | null;
  placeUnavailable: AudienceUnavailableReason | null;
}

export const EVERYONE: AudienceSnapshot = Object.freeze({
  emailDomains: null,
  institutionName: null,
  batchYear: null,
  departmentCode: null,
  departmentName: null,
  placeId: null
}) as AudienceSnapshot;

export function institutionKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Allowed institutes, in directory order, each with all its allowed email domains. */
export function listInstitutions(
  allowedDomains: ReadonlySet<string> = parseAllowedDomains(env.ALLOWED_EMAIL_DOMAINS)
): InstitutionOption[] {
  const byKey = new Map<string, InstitutionOption>();
  for (const [domain, entry] of Object.entries(DOMAIN_DIRECTORY)) {
    if (!allowedDomains.has(domain)) continue;
    const key = institutionKey(entry.institution);
    const existing = byKey.get(key);
    if (existing) existing.domains.push(domain);
    else byKey.set(key, { key, name: entry.institution, domains: [domain] });
  }
  // Allowed domains missing from the directory: their own institute, named by the domain.
  for (const domain of allowedDomains) {
    if (DOMAIN_DIRECTORY[domain]) continue;
    const key = institutionKey(domain);
    if (!byKey.has(key)) byKey.set(key, { key, name: domain, domains: [domain] });
  }
  return [...byKey.values()];
}

export function institutionForEmail(email: string, institutions: InstitutionOption[]): InstitutionOption | null {
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  return institutions.find((i) => i.domains.includes(domain)) ?? null;
}

export function isEveryoneInput(input: AudienceInput | null | undefined): boolean {
  if (!input) return true;
  return !input.institution && !input.batch && !input.department && !input.city;
}

export function isEveryone(s: AudienceSnapshot): boolean {
  return (
    s.emailDomains === null &&
    s.batchYear === null &&
    s.departmentCode === null &&
    s.placeId === null
  );
}

export type SnapshotResult =
  | { ok: true; snapshot: AudienceSnapshot; parts: AudiencePart[] }
  | { ok: false; reason: "unknown_institution" }
  | { ok: false; reason: "detail_missing"; missing: AudiencePart[] };

/** Turn the composer's choice into the stored copy, using only the author's real details. */
export function buildAudienceSnapshot(
  input: AudienceInput | null | undefined,
  facts: AuthorAudienceFacts,
  institutions: InstitutionOption[]
): SnapshotResult {
  if (isEveryoneInput(input)) return { ok: true, snapshot: { ...EVERYONE }, parts: [] };
  const want = input!;
  const parts: AudiencePart[] = [];
  const missing: AudiencePart[] = [];
  const snapshot: AudienceSnapshot = { ...EVERYONE };

  if (want.institution) {
    const inst = institutions.find((i) => i.key === want.institution);
    if (!inst) return { ok: false, reason: "unknown_institution" };
    snapshot.emailDomains = [...inst.domains];
    snapshot.institutionName = inst.name;
    parts.push("institution");
  }
  if (want.batch) {
    if (facts.batchYear === null) missing.push("batch");
    else {
      snapshot.batchYear = facts.batchYear;
      parts.push("batch");
    }
  }
  if (want.department) {
    if (!facts.departmentCode || facts.departmentUnavailable || facts.departmentCode.toLowerCase() === "other") {
      missing.push("department");
    } else {
      snapshot.departmentCode = facts.departmentCode;
      snapshot.departmentName = facts.departmentName ?? facts.departmentCode;
      parts.push("department");
    }
  }
  if (want.city) {
    if (!facts.placeId || facts.placeUnavailable) missing.push("city");
    else {
      snapshot.placeId = facts.placeId;
      parts.push("city");
    }
  }
  if (missing.length > 0) return { ok: false, reason: "detail_missing", missing };
  return { ok: true, snapshot, parts };
}

/** Parts a stored copy uses, in label order. */
export function audienceParts(s: Pick<AudienceSnapshot, "emailDomains" | "batchYear" | "departmentCode" | "placeId">): AudiencePart[] {
  const parts: AudiencePart[] = [];
  if (s.emailDomains) parts.push("institution");
  if (s.batchYear !== null) parts.push("batch");
  if (s.departmentCode) parts.push("department");
  if (s.placeId) parts.push("city");
  return parts;
}

/** "IIT (BHU) Varanasi · 2025 batch · Materials Science · Bengaluru"; null for Everyone. */
export function audienceLabel(v: {
  institutionName: string | null;
  batchYear: number | null;
  departmentName: string | null;
  placeName: string | null;
}): string | null {
  const bits = [
    v.institutionName,
    v.batchYear !== null ? `${v.batchYear} batch` : null,
    v.departmentName,
    v.placeName
  ].filter((b): b is string => Boolean(b && b.trim()));
  return bits.length > 0 ? bits.join(" · ") : null;
}

export type AudienceSize = { size: "none" } | { size: "under10" } | { size: "about"; approx: number };

/** 0 → none; 1–9 → under 10; then rounded down: to 10s below 100, 50s below 1000, 100s above. */
export function roundAudienceSize(count: number): AudienceSize {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return { size: "none" };
  if (n < 10) return { size: "under10" };
  const step = n < 100 ? 10 : n < 1000 ? 50 : 100;
  return { size: "about", approx: Math.floor(n / step) * step };
}

/** A viewer's department code, "other" counted as none. */
export function viewerDepartmentSql(v: string): string {
  return `NULLIF(lower(COALESCE((SELECT dv.code FROM departments dv WHERE dv.id = ${v}.department_id), ${v}.department_code)), 'other')`;
}

/** A place id followed through a city merge (one step: a merge target is never itself merged). */
export function resolvedPlaceSql(placeExpr: string): string {
  return `COALESCE((SELECT cpm.combined_into_place_id FROM canonical_places cpm WHERE cpm.id = ${placeExpr}), ${placeExpr})`;
}

/**
 * SQL boolean: person `v` matches an audience given as four SQL expressions (stored columns, or bound
 * parameters for the size preview). A null expression matches everyone.
 */
export function personMatchesAudienceSql(
  v: string,
  a: { emailDomains: string; batchYear: string; departmentCode: string; placeId: string }
): string {
  return `(
    (${a.emailDomains} IS NULL OR split_part(lower(${v}.institutional_email::text), '@', 2) = ANY(${a.emailDomains}))
    AND (${a.batchYear} IS NULL OR COALESCE(${v}.batch_year, ${v}.joining_year) = ${a.batchYear})
    AND (${a.departmentCode} IS NULL OR ${viewerDepartmentSql(v)} = lower(${a.departmentCode}))
    AND (${a.placeId} IS NULL OR (${v}.residence_canonical_place_id IS NOT NULL AND ${resolvedPlaceSql(`${v}.residence_canonical_place_id`)} = ${resolvedPlaceSql(a.placeId)}))
  )`;
}

/** Admins and super admins see every post. Taken from the signed-in actor's role, never from client input. */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

export type AudienceVisibilityOptions = {
  /** From the actor's role (isAdminRole). Admins see all posts. Replies stay audience-bound (isInAudience). */
  viewerIsAdmin?: boolean;
};

/**
 * THE visibility rule for a post `i` and viewer `vp` (both SQL aliases). Every read that shows a post to
 * someone other than its author must include it. The author always sees their own post; admins see all.
 * `viewerIsAdmin` is a server-side boolean and is written into the SQL as TRUE/FALSE (never user text).
 */
export function audienceVisibleSql(i: string, vp: string, options: AudienceVisibilityOptions = {}): string {
  const admin = options.viewerIsAdmin === true ? "TRUE" : "FALSE";
  return `(
    ${admin}
    OR ${i}.author_person_id = ${vp}.id
    OR ${personMatchesAudienceSql(vp, {
      emailDomains: `${i}.audience_email_domains`,
      batchYear: `${i}.audience_batch_year`,
      departmentCode: `${i}.audience_department_code`,
      placeId: `${i}.audience_place_id`
    })}
  )`;
}
