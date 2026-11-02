/** Exact domains the login form accepts. Keep in step with the API's ALLOWED_EMAIL_DOMAINS. */
const ALLOWED_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "itbhu.ac.in",
  "iitbhu.ac.in",
  "iitgn.ac.in",
  "iitg.ac.in"
]);

/** Client-side format feedback only. Does not establish verification or server eligibility. */
export function isInstitutionalEmail(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  const parts = normalized.split("@");
  return parts.length === 2 && Boolean(parts[0]) && !/\s/.test(parts[0]!) &&
    ALLOWED_EMAIL_DOMAINS.has(parts[1]!);
}
