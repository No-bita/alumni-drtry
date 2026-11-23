import { personIsDemoAlumniSql } from "./demoPersonSql.js";

/**
 * Beta alumni profiles only: real directory users for product analytics.
 * Excludes admins/super_admins, test users and seeded demo fixtures (the same rule the directory uses).
 *
 * Use as `AND (<betaPersonPredicate("p")>)` after joining `people p`.
 */
export function betaPersonPredicate(alias = "p"): string {
  const a = alias;
  return `
    ${a}.deleted_at IS NULL
    AND ${a}.role = 'alumni'
    AND NOT ${personIsDemoAlumniSql(a)}
  `.trim();
}
