/**
 * Beta alumni profiles only: real directory users for product analytics.
 * Excludes admins/super_admins, seeded demo bios (`[DEMO]`), and e2e test users.
 *
 * Use as `AND (<betaPersonPredicate("p")>)` after joining `people p`.
 */
export function betaPersonPredicate(alias = "p"): string {
  const a = alias;
  return `
    ${a}.deleted_at IS NULL
    AND ${a}.role = 'alumni'
    AND COALESCE(${a}.is_test_user, FALSE) = FALSE
    AND (${a}.bio IS NULL OR ${a}.bio NOT ILIKE '%[DEMO]%')
  `.trim();
}
