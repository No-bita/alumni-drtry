/**
 * Department codes aligned with DB seed / web `DEPARTMENTS` (migration 002, `apps/web` constants).
 * Used for MVP query normalization from free text.
 */
export const DIRECTORY_DEPARTMENT_CODES = new Set<string>([
  "bme",
  "bt",
  "ce",
  "cer",
  "ch",
  "chem",
  "civil",
  "cse",
  "ece",
  "eee",
  "me",
  "mec",
  "met",
  "meta",
  "mst",
  "min",
  "pharm"
]);
