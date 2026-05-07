import type { MyProfileView } from "../api/client";
import { DEPARTMENTS } from "../constants/departments";
import { demoDisplayFullName } from "./demoProfile";
import { displayFirstNameFromEmail } from "./emailDisplayName";

function departmentLabelFromCode(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  const c = code.trim().toLowerCase();
  const row = DEPARTMENTS.find((d) => d.code === c);
  return row?.label ?? null;
}

/** Short label like “CSE 2019” — dept segment from code/catalog only; never departmentName. */
export function cohortLabelFromProfile(profile: Pick<MyProfileView, "departmentCode" | "batchYear">): string {
  const dept = departmentLabelFromCode(profile.departmentCode);
  const year = profile.batchYear;
  if (dept && year != null) return `${dept} ${year}`;
  if (year != null) return String(year);
  if (dept) return dept;
  return "your batch";
}

export function firstNameForGreeting(fullName: string | null | undefined, email: string): string {
  const t = demoDisplayFullName(fullName);
  if (t) {
    const first = t.split(/\s+/)[0];
    if (first) return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }
  return displayFirstNameFromEmail(email);
}
