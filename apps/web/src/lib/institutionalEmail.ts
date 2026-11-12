/** Frontend feedback only, not proof of institutional identity or server eligibility.
 * Personal-provider families approved in chat. Exact domains only, never MX/provider hosting:
 * institute domains hosted by Google or Microsoft must still pass this check.
 */
const PERSONAL_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com", "googlemail.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "yahoo.co.in", "yahoo.in", "yahoo.co.uk", "yahoo.fr", "ymail.com", "rocketmail.com",
  "icloud.com", "me.com", "mac.com",
  "aol.com", "aim.com",
  "proton.me", "protonmail.com", "pm.me", "protonmail.ch",
  "rediffmail.com"
]);

export const INSTITUTIONAL_EMAIL_QUESTION = "is this really your insti email id? you sure? pinky promise?";

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
  if (parts.length !== 2 || !parts[0] || /\s/.test(parts[0])) return false;
  const domain = parts[1]!;
  // Preserve email syntax validation now that the finite institute list is gone.
  const validDomain = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain);
  return validDomain && !PERSONAL_EMAIL_DOMAINS.has(domain);
}
