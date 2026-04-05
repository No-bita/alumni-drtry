import { normalizeEmail } from "./domainAllowlist.js";

export interface ParsedIdentity {
  normalizedEmail: string;
  departmentCode: string | null;
  departmentName: string | null;
  joiningYear: number | null;
  /** From dotted locals like firstname.lastname.deptyy e.g. arjun.cse20 */
  parsedFirstName: string | null;
  parsedLastName: string | null;
}

const DEPARTMENT_BY_CODE: Record<string, string> = {
  cse: "Computer Science and Engineering",
  ece: "Electronics Engineering",
  eee: "Electrical Engineering",
  mec: "Mechanical Engineering",
  me: "Mechanical Engineering",
  civil: "Civil Engineering",
  ce: "Civil Engineering",
  chem: "Chemical Engineering",
  ch: "Chemical Engineering",
  min: "Mining Engineering",
  meta: "Metallurgical Engineering",
  met: "Metallurgical Engineering",
  mst: "Material Sciences and Technology",
  cer: "Ceramic Engineering",
  pharm: "Pharmaceutical Engineering",
  bt: "Biochemical Engineering",
  bme: "Biomedical Engineering"
};

const PATTERNS = [
  /^(?<dept>[a-z]{2,10})(?<year>\d{2})(?<rest>[a-z0-9._-]*)$/i,
  /^(?<year>\d{2})(?<dept>[a-z]{2,10})(?<rest>[a-z0-9._-]*)$/i,
  /^(?<dept>[a-z]{2,10})(?<year>\d{4})(?<rest>[a-z0-9._-]*)$/i,
  /^(?<year>\d{4})(?<dept>[a-z]{2,10})(?<rest>[a-z0-9._-]*)$/i
];

/**
 * Local part layout: `firstname[.middles].lastname.deptYY` — the **last** segment is always
 * department code + 2- or 4-digit joining year. Earlier segments: first name, optional middles,
 * then last name (one segment). Single-segment locals support dept-only, e.g. `cse20`.
 */
function tryParseDeptYearBeforeFirstDigit(localPart: string): Omit<ParsedIdentity, "normalizedEmail"> | null {
  const segments = localPart.split(".").filter((s) => s.length > 0);
  if (segments.length === 0) {
    return null;
  }

  const last = segments[segments.length - 1]!;
  const dIdx = last.search(/\d/);
  if (dIdx < 1) {
    return null;
  }

  let ls = dIdx - 1;
  while (ls >= 0 && /[a-z]/i.test(last.charAt(ls))) {
    ls -= 1;
  }
  const departmentCode = last.slice(ls + 1, dIdx).toLowerCase();
  if (departmentCode.length < 2) {
    return null;
  }

  const yM = last.slice(dIdx).match(/^(\d{4}|\d{2})/);
  if (!yM) {
    return null;
  }
  const joiningYear = normalizeYear(yM[1]!);
  if (joiningYear === null) {
    return null;
  }

  const departmentName = DEPARTMENT_BY_CODE[departmentCode] ?? null;

  const nameSegs = segments.slice(0, -1);
  let parsedFirstName: string | null = null;
  let parsedLastName: string | null = null;
  if (nameSegs.length === 1) {
    parsedFirstName = nameSegs[0]!;
    parsedLastName = null;
  } else if (nameSegs.length >= 2) {
    parsedFirstName = nameSegs.slice(0, -1).join(" ");
    parsedLastName = nameSegs[nameSegs.length - 1]!;
  }

  return {
    departmentCode,
    departmentName,
    joiningYear,
    parsedFirstName,
    parsedLastName
  };
}

function normalizeYear(rawYear: string): number | null {
  const now = new Date().getUTCFullYear();
  if (rawYear.length === 2) {
    const value = Number(rawYear);
    if (Number.isNaN(value)) {
      return null;
    }
    const nowTwoDigit = now % 100;
    const year = value <= nowTwoDigit + 1 ? 2000 + value : 1900 + value;
    if (year < 1960 || year > now + 1) {
      return null;
    }
    return year;
  }

  const year = Number(rawYear);
  if (Number.isNaN(year) || year < 1960 || year > now + 1) {
    return null;
  }
  return year;
}

export function parseInstitutionalIdentity(email: string): ParsedIdentity {
  const normalizedEmail = normalizeEmail(email);
  const localPart = normalizedEmail.split("@")[0] ?? "";

  const deptYear = tryParseDeptYearBeforeFirstDigit(localPart);
  if (deptYear) {
    return {
      normalizedEmail,
      ...deptYear
    };
  }

  let departmentCode: string | null = null;
  let joiningYear: number | null = null;

  for (const pattern of PATTERNS) {
    const match = localPart.match(pattern);
    if (!match?.groups) {
      continue;
    }
    const candidateDept = (match.groups.dept ?? "").toLowerCase();
    const candidateYear = normalizeYear(match.groups.year ?? "");

    departmentCode = candidateDept || null;
    joiningYear = candidateYear;
    break;
  }

  if (!departmentCode && localPart.length >= 2) {
    const fallbackDept = localPart.match(/[a-z]{2,10}/i)?.[0]?.toLowerCase() ?? null;
    departmentCode = fallbackDept;
  }

  const departmentName = departmentCode ? DEPARTMENT_BY_CODE[departmentCode] ?? null : null;

  return {
    normalizedEmail,
    departmentCode,
    departmentName,
    joiningYear,
    parsedFirstName: null,
    parsedLastName: null
  };
}

