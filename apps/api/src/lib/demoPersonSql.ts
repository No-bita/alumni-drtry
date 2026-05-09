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
