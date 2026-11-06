import type { Metadata } from "next";
import { Caveat, IBM_Plex_Mono, IBM_Plex_Sans_Condensed } from "next/font/google";
import "./globals.css";
import { copy } from "../content/copy.ts";

const plexCondensed = IBM_Plex_Sans_Condensed({
  variable: "--font-plex-condensed",
  subsets: ["latin"],
  weight: "700",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: "700",
});

/**
 * Absolute base for OG/Twitter image URLs. Set NEXT_PUBLIC_SITE_URL to the landing page origin;
 * when unset, Next.js falls back to VERCEL_PROJECT_PRODUCTION_URL on Vercel (localhost in dev).
 */
function parseSiteUrl(raw: string | undefined): URL | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    // Accept "example.com" as well as "https://example.com"; ignore anything unparseable.
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
}

const siteUrl = parseSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

// Favicon: app/icon.svg. Share image: app/opengraph-image.png (+ .alt.txt). Both are file conventions.
export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: siteUrl } : {}),
  title: copy.seo.title,
  description: copy.seo.description,
  openGraph: {
    title: copy.seo.title,
    description: copy.seo.description,
    siteName: "Alma Mater",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: copy.seo.title,
    description: copy.seo.description,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexCondensed.variable} ${plexMono.variable} ${caveat.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
