/** Canonical platform labels stored in profile_links (aligned with onboarding). */
export const SOCIAL_PLATFORM = {
  twitter: "Twitter",
  linkedin: "LinkedIn",
  github: "GitHub",
} as const;

export type SocialPlatformKey = keyof typeof SOCIAL_PLATFORM;

export function socialPlatformLabel(key: SocialPlatformKey): string {
  return SOCIAL_PLATFORM[key];
}

/**
 * Trim and ensure URL has a scheme so the API zod.url() accepts it.
 * Returns null for blank input; throws nothing — returns null if URL is invalid.
 */
export function normalizeSocialUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  let u = t;
  if (!/^https?:\/\//i.test(u)) {
    u = `https://${u}`;
  }
  try {
    const parsed = new URL(u);
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
