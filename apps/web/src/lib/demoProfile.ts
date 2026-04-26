export const DEMO_PROFILE_MARKER = "[DEMO]";

export function isDemoProfileBio(bio: string | null | undefined): boolean {
  return typeof bio === "string" && bio.includes(DEMO_PROFILE_MARKER);
}
