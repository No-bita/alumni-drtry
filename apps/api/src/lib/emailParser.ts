import { normalizeEmail } from "./domainAllowlist.js";

export interface ParsedIdentity {
  normalizedEmail: string;
  departmentCode: string | null;
  departmentName: string | null;
  joiningYear: number | null;
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
  cer: "Ceramic Engineering",
  pharm: "Pharmaceutical Engineering",
  bt: "Biochemical Engineering",
  bme: "Biomedical Engineering"
};

const PATTERNS = [
  /^(?<dept>[a-z]{2,8})(?<year>\d{2})(?<rest>[a-z0-9._-]*)$/i,
  /^(?<year>\d{2})(?<dept>[a-z]{2,8})(?<rest>[a-z0-9._-]*)$/i,
  /^(?<dept>[a-z]{2,8})(?<year>\d{4})(?<rest>[a-z0-9._-]*)$/i,
  /^(?<year>\d{4})(?<dept>[a-z]{2,8})(?<rest>[a-z0-9._-]*)$/i
];

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
    const fallbackDept = localPart.match(/[a-z]{2,8}/i)?.[0]?.toLowerCase() ?? null;
    departmentCode = fallbackDept;
  }

  const departmentName = departmentCode ? DEPARTMENT_BY_CODE[departmentCode] ?? null : null;

  return {
    normalizedEmail,
    departmentCode,
    departmentName,
    joiningYear
  };
}

