export function parseAllowedDomains(raw: string): ReadonlySet<string> {
  const domains = raw
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
  return new Set(domains);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isInstitutionalEmailAllowed(email: string, allowedDomains: ReadonlySet<string>): boolean {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    return false;
  }
  const domain = normalized.slice(atIndex + 1);
  return allowedDomains.has(domain);
}


/** IIT (BHU) domains: the only institutes whose email locals follow the firstname.lastname.deptYY layout. */
export const BHU_INSTITUTIONAL_DOMAINS: ReadonlySet<string> = new Set([
  "itbhu.ac.in",
  "iitbhu.ac.in"
]);

/** Email-based identity inference is only defined for BHU locals; other allowed institutes use free-form locals. */
export function isBhuInstitutionalEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    return false;
  }
  return BHU_INSTITUTIONAL_DOMAINS.has(normalized.slice(atIndex + 1));
}
