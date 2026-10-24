/** Client-side format feedback only. Does not establish verification or server eligibility. */
export function isInstitutionalEmail(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  const parts = normalized.split("@");
  return parts.length === 2 && Boolean(parts[0]) && !/\s/.test(parts[0]!) &&
    (parts[1] === "itbhu.ac.in" || parts[1] === "iitbhu.ac.in");
}
