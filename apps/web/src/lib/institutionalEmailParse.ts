import { DEPARTMENT_LABEL_BY_CODE } from "@department-catalog";

/**
 * Client-side institutional local-part parsing (keep in sync with apps/api/src/lib/emailParser.ts).
 * Layout: firstname[.middles].lastname.deptYY — last segment is dept + year; firstname.deptYY when no last name.
 */

const DEPARTMENT_CODE_ALIASES: Record<string, string> = {
  // Legacy aliases still seen in email locals.
  me: "mech",
  mec: "mech",
  ce: "civil",
  ch: "chem",
  met: "meta",
  pharm: "pharma",
  bt: "bce",
  civ: "civil",
  cera: "cer",
};

function normalizeDepartmentCode(raw: string): string {
  const key = raw.trim().toLowerCase();
  return DEPARTMENT_CODE_ALIASES[key] ?? key;
}

const LEGACY_PATTERNS = [
  /^(?<dept>[a-z]{2,10})(?<year>\d{2})(?<rest>[a-z0-9._-]*)$/i,
  /^(?<year>\d{2})(?<dept>[a-z]{2,10})(?<rest>[a-z0-9._-]*)$/i,
  /^(?<dept>[a-z]{2,10})(?<year>\d{4})(?<rest>[a-z0-9._-]*)$/i,
  /^(?<year>\d{4})(?<dept>[a-z]{2,10})(?<rest>[a-z0-9._-]*)$/i,
];

/** Last segment is always dept + year; earlier segments are firstname[.middles].lastname */
function tryParseDeptYearBeforeFirstDigit(localPart: string): {
  firstName: string;
  lastName: string;
  departmentCode: string;
  joiningYear: number;
} | null {
  const segments = localPart.split(".").filter((s) => s.length > 0);
  if (segments.length === 0) return null;

  const last = segments[segments.length - 1]!;
  const dIdx = last.search(/\d/);
  if (dIdx < 1) return null;

  let ls = dIdx - 1;
  while (ls >= 0 && /[a-z]/i.test(last.charAt(ls))) ls--;
  const departmentCode = normalizeDepartmentCode(last.slice(ls + 1, dIdx));
  if (departmentCode.length < 2) return null;

  const yM = last.slice(dIdx).match(/^(\d{4}|\d{2})/);
  if (!yM) return null;
  const joiningYear = normalizeYear(yM[1]!);
  if (joiningYear === null) return null;

  const nameSegs = segments.slice(0, -1);
  let firstRaw = "";
  let lastRaw = "";
  if (nameSegs.length === 1) {
    firstRaw = nameSegs[0]!;
  } else if (nameSegs.length >= 2) {
    firstRaw = nameSegs.slice(0, -1).join(" ");
    lastRaw = nameSegs[nameSegs.length - 1]!;
  }

  return {
    firstName: firstRaw ? toDisplayNamePart(firstRaw) : "",
    lastName: lastRaw ? toDisplayNamePart(lastRaw) : "",
    departmentCode,
    joiningYear,
  };
}

function normalizeYear(rawYear: string): number | null {
  const now = new Date().getUTCFullYear();
  if (rawYear.length === 2) {
    const value = Number(rawYear);
    if (Number.isNaN(value)) return null;
    const nowTwoDigit = now % 100;
    const year = value <= nowTwoDigit + 1 ? 2000 + value : 1900 + value;
    if (year < 1960 || year > now + 5) return null;
    return year;
  }
  const year = Number(rawYear);
  if (Number.isNaN(year) || year < 1960 || year > now + 5) return null;
  return year;
}

function toTitleToken(w: string): string {
  if (!w) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/** Title-case each whitespace-separated word */
export function toDisplayNamePart(raw: string): string {
  return raw
    .split(/\s+/)
    .map(toTitleToken)
    .join(" ");
}

export type ParsedInstitutionalEmail = {
  firstName: string;
  lastName: string;
  departmentCode: string | null;
  departmentDisplayName: string | null;
  joiningYear: number | null;
};

export function parseInstitutionalEmailForOnboarding(email: string): ParsedInstitutionalEmail {
  const normalized = email.trim().toLowerCase();
  const localPart = normalized.split("@")[0] ?? "";

  const deptYear = tryParseDeptYearBeforeFirstDigit(localPart);
  if (deptYear) {
    return {
      firstName: deptYear.firstName,
      lastName: deptYear.lastName,
      departmentCode: deptYear.departmentCode,
      departmentDisplayName: DEPARTMENT_LABEL_BY_CODE[deptYear.departmentCode] ?? null,
      joiningYear: deptYear.joiningYear,
    };
  }

  let departmentCode: string | null = null;
  let joiningYear: number | null = null;
  for (const pattern of LEGACY_PATTERNS) {
    const match = localPart.match(pattern);
    if (!match?.groups) continue;
    joiningYear = normalizeYear(match.groups.year ?? "");
    const rawDept = (match.groups.dept ?? "").toLowerCase();
    departmentCode = rawDept ? normalizeDepartmentCode(rawDept) : null;
    break;
  }

  return {
    firstName: "",
    lastName: "",
    departmentCode,
    departmentDisplayName: departmentCode ? DEPARTMENT_LABEL_BY_CODE[departmentCode] ?? null : null,
    joiningYear,
  };
}
