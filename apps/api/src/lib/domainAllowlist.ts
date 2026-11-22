/**
 * Directory of allowed email domains by institution. `type` records whether a domain is an
 * institute domain (shared by current students and alumni) or an alumni-association domain;
 * it never labels an individual member's status, and access is identical for every domain.
 */
export type AllowedDomainType = "institute" | "alumni-association";

export const DOMAIN_DIRECTORY: Readonly<Record<string, { institution: string; type: AllowedDomainType }>> = {
  "iitbhu.ac.in": { institution: "IIT (BHU) Varanasi", type: "institute" },
  "itbhu.ac.in": { institution: "IIT (BHU) Varanasi", type: "institute" },
  "iitb.ac.in": { institution: "IIT Bombay", type: "institute" },
  "iitbombay.org": { institution: "IIT Bombay", type: "alumni-association" },
  "iima.ac.in": { institution: "IIM Ahmedabad", type: "institute" },
  "iiml.ac.in": { institution: "IIM Lucknow", type: "institute" },
  "iiml.org": { institution: "IIM Lucknow", type: "alumni-association" },
  "iitg.ac.in": { institution: "IIT Guwahati", type: "institute" },
  "iitgn.ac.in": { institution: "IIT Gandhinagar", type: "institute" }
};

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
