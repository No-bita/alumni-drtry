/**
 * Re-export canonical catalog from API source (`apps/api/src/constants/departmentCatalog.ts`)
 * via Vite alias `@department-catalog` — single source for labels and codes.
 */
export { DEPARTMENTS, type DepartmentCode } from "@department-catalog";
