import type { ProfileLinkView } from "../api/client";

/** Canonical platform labels stored in profile_links (aligned with onboarding). */
export const SOCIAL_PLATFORM = {
  linkedin: "LinkedIn",
  github: "GitHub",
  twitter: "Twitter",
} as const;

export type SocialPlatformKey = keyof typeof SOCIAL_PLATFORM;

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
