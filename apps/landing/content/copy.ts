export const SHARE_PREVIEW_TITLE = "Alma Mater - Life is unfair. Use your unfair advantage.";

// Static page copy, taken verbatim from the landing page spec (sections 5.1 to 5.10, 7).
// The OG image and favicon are file-based metadata: app/opengraph-image.png and app/icon.svg.

// Live platform entry point. Every landing CTA opens the main platform's login page.
export const PLATFORM_URL = "https://almamatter.in/app/login";

export const copy = {
  footer: {
    wordmark: "ALMA MATER",
    tagline: "Made for alumni, by an alum.",
    contactEmail: "aaryan@aaryanshah.co.in",
  },

  seo: {
    title: "Alma Mater — Find the alum who can help",
    description:
      "Alma Mater is a private members' community for the top institutions of India. Apply to become a member.",
  },
} as const;
