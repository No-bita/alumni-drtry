/**
 * Re-export canonical catalog from API source (`apps/api/src/constants/departmentCatalog.ts`)
 * via Vite alias `@department-catalog` — single source for labels, codes, and avatar colours.
 */
export {
  DEPARTMENTS,
  type DepartmentCode,
  departmentAvatarBackground,
} from "@department-catalog";
