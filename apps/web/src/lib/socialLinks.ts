import type { ProfileLinkView } from "../api/client";

/** Canonical platform labels stored in profile_links (aligned with onboarding). */
export const SOCIAL_PLATFORM = {
  linkedin: "LinkedIn",
  github: "GitHub",
  twitter: "Twitter",
} as const;

export type SocialPlatformKey = keyof typeof SOCIAL_PLATFORM;

export const SOCIAL_PLATFORM_ORDER: SocialPlatformKey[] = ["linkedin", "github", "twitter"];

export const SOCIAL_LINK_PLACEHOLDERS: Record<SocialPlatformKey, string> = {
  linkedin: "linkedin.com/in/your-handle",
  github: "github.com/username",
  twitter: "x.com/username",
};

export function emptySocialLinkDraft(): Record<SocialPlatformKey, string> {
  return { linkedin: "", github: "", twitter: "" };
}

export function linkToSocialPlatformKey(link: ProfileLinkView): SocialPlatformKey | null {
  const platform = link.platform.toLowerCase();
  const url = link.url.toLowerCase();
  if (platform.includes("linkedin") || url.includes("linkedin.com")) return "linkedin";
  if (platform.includes("github") || url.includes("github.com")) return "github";
  if (
    platform.includes("twitter") ||
    platform === "x" ||
    platform.includes("x/twitter") ||
    url.includes("twitter.com") ||
    url.includes("x.com")
  ) {
    return "twitter";
  }
  return null;
}

export function socialLinksDraftFromProfile(links: ProfileLinkView[]): Record<SocialPlatformKey, string> {
  const draft = emptySocialLinkDraft();
  for (const link of links) {
    const key = linkToSocialPlatformKey(link);
    if (key) draft[key] = link.url;
  }
  return draft;
}

export function otherProfileLinks(links: ProfileLinkView[]): ProfileLinkView[] {
  return links.filter((link) => !linkToSocialPlatformKey(link));
}

export function socialLinksByPlatform(links: ProfileLinkView[]): Map<SocialPlatformKey, ProfileLinkView> {
  const byKey = new Map<SocialPlatformKey, ProfileLinkView>();
  for (const link of links) {
    const key = linkToSocialPlatformKey(link);
    if (key && !byKey.has(key)) byKey.set(key, link);
  }
  return byKey;
}

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
