import type { Metadata } from "next";
import { siteUrl } from "../lib/site.ts";
import { Caveat, IBM_Plex_Mono, IBM_Plex_Sans_Condensed } from "next/font/google";
import "./globals.css";
import { copy, SHARE_PREVIEW_TITLE } from "../content/copy.ts";

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

// Favicon: app/icon.svg. Share image: app/opengraph-image.png (+ .alt.txt). Both are file conventions.
export const metadata: Metadata = {
  metadataBase: siteUrl,
 alternates: { canonical: "/" },
  title: copy.seo.title,
  description: copy.seo.description,
  openGraph: {
    title: SHARE_PREVIEW_TITLE,
    description: copy.seo.description,
    siteName: "Alma Mater",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_PREVIEW_TITLE,
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
