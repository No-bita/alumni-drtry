/**
 * Department codes and labels matching API/DB seed (migration 002).
 * Use `code` for API params (PATCH profile, search filter); use `label` for display.
 */
export const DEPARTMENTS = [
  { code: "bme", label: "Biomedical Eng" },
  { code: "bt", label: "Biochemical Eng" },
  { code: "ce", label: "Civil Eng" },
  { code: "cer", label: "Ceramic Eng" },
  { code: "ch", label: "Chemical Eng" },
  { code: "chem", label: "Chemical Eng" },
  { code: "civil", label: "Civil Eng" },
  { code: "cse", label: "CSE" },
  { code: "ece", label: "ECE" },
  { code: "eee", label: "EEE" },
  { code: "me", label: "Mechanical Eng" },
  { code: "mec", label: "Mech Eng" },
  { code: "met", label: "Metallurgical Eng" },
  { code: "meta", label: "Metallurgical Eng" },
  { code: "min", label: "Mining Eng" },
  { code: "pharm", label: "Pharmaceutical Eng" },
] as const;

export type DepartmentCode = (typeof DEPARTMENTS)[number]["code"];
