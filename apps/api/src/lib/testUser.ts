/**
 * Marks institutional emails used for API/e2e tests and seeded demo accounts.
 * Used when creating/updating `people` rows so `DELETE ... WHERE is_test_user` can purge before prod.
 */
export function isTestInstitutionalEmail(institutionalEmail: string): boolean {
  const at = institutionalEmail.indexOf("@");
  if (at <= 0) return false;
  const local = institutionalEmail.slice(0, at).toLowerCase();
  return local.startsWith("e2e");
}
