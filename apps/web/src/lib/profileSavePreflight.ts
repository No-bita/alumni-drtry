import { validateOccupationDraft, type OccupationDraft } from "./occupationProfileEdit";
import { normalizeSocialUrl, socialPlatformLabel, SOCIAL_PLATFORM_ORDER, type SocialPlatformKey } from "./socialLinks";

/** A usable link needs a dotted hostname. "linkedin" alone becomes https://linkedin/ and must not pass. */
function hasQualifiedHost(url: string | null): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host.includes(".") && !host.startsWith(".") && !host.endsWith(".");
  } catch {
    return false;
  }
}

/**
 * Everything that can be checked without the network, checked up front.
 * Returns the first problem, or null when the save is safe to start.
 */
export function preflightProfileEdits(
  occupations: OccupationDraft[],
  socialLinks: Record<SocialPlatformKey, string>,
  personalEmail = "",
): string | null {
  const email = personalEmail.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "That personal email has a typo somewhere. Nothing was saved yet, so fix it and tap save again.";
  }
  for (const draft of occupations) {
    const problem = validateOccupationDraft(draft);
    if (problem) return `${problem} Nothing was saved yet, so fix it and tap save again.`;
  }
  for (const key of SOCIAL_PLATFORM_ORDER) {
    const raw = socialLinks[key] ?? "";
    if (raw.trim() && !hasQualifiedHost(normalizeSocialUrl(raw))) {
      return `That ${socialPlatformLabel(key)} link does not look like a link. Nothing was saved yet, so fix it and tap save again.`;
    }
  }
  return null;
}
