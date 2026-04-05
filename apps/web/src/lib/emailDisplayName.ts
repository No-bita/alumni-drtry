/**
 * Derives a first token from the email local part. Periods and underscores are
 * treated as word separators (no "." in the result).
 */
export function firstTokenFromEmailLocalPart(email: string | undefined): string {
  if (!email?.trim()) return "there";
  const local = email.split("@")[0] ?? "";
  const normalized = local
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (!normalized) return "there";
  const first = normalized.split(/\s+/)[0] ?? "";
  return first.toLowerCase() || "there";
}

/** Capitalized first name for greetings when full name is unavailable. */
export function displayFirstNameFromEmail(email: string | undefined): string {
  const t = firstTokenFromEmailLocalPart(email);
  if (t === "there") return "There";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Initials label for navbar avatar when only email is known. */
export function avatarLabelFromEmail(email: string | undefined): string {
  const t = firstTokenFromEmailLocalPart(email);
  if (t === "there") return "You";
  return t.charAt(0).toUpperCase() + t.slice(1);
}
