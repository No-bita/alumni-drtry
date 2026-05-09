/**
 * TS mirror of {@link personIsDemoSql}: seeded demo / batch-demo / platform-demo alumni.
 * Use for product exceptions scoped to demo recipients (not for excluding rows from directory search).
 */
export function personRowIsDemoProfile(person: {
  is_test_user: boolean;
  institutional_email: string;
}): boolean {
  if (person.is_test_user) return true;
  const email = person.institutional_email;
  const at = email.indexOf("@");
  const local = (at > 0 ? email.slice(0, at) : "").toLowerCase();
  return local.startsWith("batchdemo.") || local.startsWith("platformdemo.");
}
