/** Exact domains the login form accepts. Keep in step with the API's ALLOWED_EMAIL_DOMAINS. */
const ALLOWED_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "itbhu.ac.in",
  "iitbhu.ac.in",
  "iitgn.ac.in",
  "iitg.ac.in",
  "iiml.org.in"
]);

/** Client-side format feedback only. Does not establish verification or server eligibility. */
/** Domains whose locals follow the BHU firstname.lastname.deptYY layout; inference stays scoped to these. */
const BHU_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "itbhu.ac.in",
  "iitbhu.ac.in"
]);

export function isBhuInstitutionalEmail(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  const parts = normalized.split("@");
  return parts.length === 2 && Boolean(parts[0]) && BHU_EMAIL_DOMAINS.has(parts[1]!);
}

export function isInstitutionalEmail(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  const parts = normalized.split("@");
  return parts.length === 2 && Boolean(parts[0]) && !/\s/.test(parts[0]!) &&
    ALLOWED_EMAIL_DOMAINS.has(parts[1]!);
}
