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

