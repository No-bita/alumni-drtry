/**
 * Canonical directory departments: codes and labels.
 * Aligns with DB seed (migrations 002+). Consumed by API email parsing / query normalization
 * and by the web app via `vite.config` alias `@department-catalog` → this file.
 */
export const DEPARTMENTS = [
  { code: "bme", label: "Biomedical Engineering" },
  { code: "bce", label: "Biochemical Engineering" },
  { code: "civil", label: "Civil Engineering" },
  { code: "cer", label: "Ceramic Engineering" },
  { code: "chem", label: "Chemical Engineering" },
  { code: "cse", label: "Computer Science and Engineering" },
  { code: "ece", label: "Electronics Engineering" },
  { code: "eee", label: "Electrical Engineering" },
  { code: "mech", label: "Mechanical Engineering" },
  { code: "meta", label: "Metallurgical Engineering" },
  { code: "mst", label: "Material Sciences and Technology" },
  { code: "min", label: "Mining Engineering" },
  { code: "pharma", label: "Pharmaceutical Engineering" },
  { code: "apd", label: "Architecture, Planning and Design" },
  { code: "ic", label: "Industrial Chemistry" },
  { code: "ep", label: "Engineering Physics" },
  { code: "mnc", label: "Mathematics and Computing" },
  { code: "dse", label: "Decision Science and Engineering" },
  { code: "hum", label: "Humanities" },
] as const;

export type DepartmentCode = (typeof DEPARTMENTS)[number]["code"];

/** Codes accepted in free-text directory search normalization. */
export const DIRECTORY_DEPARTMENT_CODES: Set<string> = new Set(DEPARTMENTS.map((d) => d.code));

/** Lowercase code → display name (email local-part parsing, etc.). */
export const DEPARTMENT_LABEL_BY_CODE: Record<string, string> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.code, d.label])
);
