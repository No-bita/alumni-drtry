/**
 * Canonical directory departments: codes, labels, and avatar background fills (web UI).
 * Aligns with DB seed (migrations 002+). Consumed by API email parsing / query normalization
 * and by the web app via `vite.config` alias `@department-catalog` → this file.
 */
export const DEPARTMENTS = [
  { code: "bme", label: "Biomedical Engineering", avatarBg: "#e8d4dc" },
  { code: "bce", label: "Biochemical Engineering", avatarBg: "#d4ebe0" },
  { code: "civil", label: "Civil Engineering", avatarBg: "#d0dde8" },
  { code: "cer", label: "Ceramic Engineering", avatarBg: "#ebd8cc" },
  { code: "chem", label: "Chemical Engineering", avatarBg: "#f2ead0" },
  { code: "cse", label: "Computer Science and Engineering", avatarBg: "#d6e2f5" },
  { code: "ece", label: "Electronics Engineering", avatarBg: "#e0d8f0" },
  { code: "eee", label: "Electrical Engineering", avatarBg: "#f5ead4" },
  { code: "mech", label: "Mechanical Engineering", avatarBg: "#cfd8e8" },
  { code: "meta", label: "Metallurgical Engineering", avatarBg: "#e8dfd4" },
  { code: "mst", label: "Material Sciences and Technology", avatarBg: "#e4dff0" },
  { code: "min", label: "Mining Engineering", avatarBg: "#ddd8d0" },
  { code: "pharma", label: "Pharmaceutical Engineering", avatarBg: "#d4f0e4" },
  { code: "apd", label: "Architecture, Planning and Design", avatarBg: "#ebe6d8" },
  { code: "ic", label: "Industrial Chemistry", avatarBg: "#d0ebe8" },
  { code: "ep", label: "Engineering Physics", avatarBg: "#e4d4ed" },
  { code: "mnc", label: "Mathematics and Computing", avatarBg: "#e8e2f5" },
  { code: "dse", label: "Decision Science and Engineering", avatarBg: "#d5e8da" },
  { code: "hum", label: "Humanities", avatarBg: "#edd8d8" },
] as const;

export type DepartmentCode = (typeof DEPARTMENTS)[number]["code"];

/** Codes accepted in free-text directory search normalization. */
export const DIRECTORY_DEPARTMENT_CODES: Set<string> = new Set(DEPARTMENTS.map((d) => d.code));

/** Lowercase code → display name (email local-part parsing, etc.). */
export const DEPARTMENT_LABEL_BY_CODE: Record<string, string> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.code, d.label])
);

/** Background for avatars when code matches the canonical list (case-insensitive). */
export function departmentAvatarBackground(code: string | null | undefined): string | undefined {
  const raw = code?.trim().toLowerCase();
  if (!raw) return undefined;
  for (const d of DEPARTMENTS) {
    if (d.code === raw) return d.avatarBg;
  }
  return undefined;
}
