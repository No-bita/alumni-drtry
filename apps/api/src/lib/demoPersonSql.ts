import { env } from "../config/env.js";

/**
 * SQL boolean expression: whether a person row is a demo/test alumni for UI badges.
 * Matches `people.is_test_user` plus institutional local-part prefixes used by seed scripts.
 * TS equivalent for policy checks: `demoPersonProfile.ts` → `personRowIsDemoProfile`.
 *
 * @param tableAlias — Postgres alias for `people` (e.g. `p`, `auth_p`)
 */
export function personIsDemoSql(tableAlias: string): string {
  return `(
  COALESCE(${tableAlias}.is_test_user, FALSE)
  OR split_part(lower(${tableAlias}.institutional_email::text), '@', 1) LIKE 'batchdemo.%'
  OR split_part(lower(${tableAlias}.institutional_email::text), '@', 1) LIKE 'platformdemo.%'
)`;
}

/** Demo/test rows including legacy `demo.alumni.*` seeds (migration 026). */
export function personIsDemoAlumniSql(tableAlias: string): string {
  const legacyDemoAlumni = `split_part(lower(${tableAlias}.institutional_email::text), '@', 1) LIKE 'demo.alumni.%'`;
  return `(${personIsDemoSql(tableAlias)} OR ${legacyDemoAlumni})`;
}

/** Directory and public profile surfaces: only real alumni. */
export function personIsProductionAlumniSql(tableAlias: string): string {
  return `NOT (${personIsDemoAlumniSql(tableAlias)})`;
}

/**
 * Directory search and public profile loads: production alumni only; in development/test
 * also include demo/test seeds (caller should still require profile_completed_at / full_name).
 */
export function personIsDiscoverableAlumniSql(tableAlias: string): string {
  const production = personIsProductionAlumniSql(tableAlias);
  if (env.NODE_ENV !== "development" && env.NODE_ENV !== "test") {
    return production;
  }
  return `(${production} OR ${personIsDemoAlumniSql(tableAlias)})`;
}

/** @deprecated Use {@link personIsDiscoverableAlumniSql}. */
export function personIsPublicProfileViewableSql(tableAlias: string): string {
  return personIsDiscoverableAlumniSql(tableAlias);
}
