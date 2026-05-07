export const DEMO_PROFILE_MARKER = "[DEMO]";

export function isDemoProfileBio(bio: string | null | undefined): boolean {
  return typeof bio === "string" && bio.includes(DEMO_PROFILE_MARKER);
}

/** Strip seeded `[DEMO] ` prefix from names for display; the Demo chip still uses {@link isDemoProfileBio}. */
export function demoDisplayFullName(fullName: string | null | undefined): string {
  if (fullName == null) return "";
  const trimmed = fullName.trim();
  if (!trimmed) return "";
  const stripped = trimmed.replace(/^\[DEMO\]\s*/, "").trim();
  return stripped.length > 0 ? stripped : trimmed;
}
