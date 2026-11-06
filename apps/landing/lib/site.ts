// Public origin of the landing site. NEXT_PUBLIC_SITE_URL overrides it (previews, local runs).
export const DEFAULT_SITE_URL = "https://almamatter.in";

export function parseSiteUrl(raw: string | undefined): URL | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    // Accept "example.com" as well as "https://example.com"; ignore anything unparseable.
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
}

export const siteUrl: URL = parseSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) ?? new URL(DEFAULT_SITE_URL);

// Public pages that belong in the sitemap. Private app pages are never listed.
export const PUBLIC_PATHS = ["/", "/privacy-policy", "/tos"] as const;
