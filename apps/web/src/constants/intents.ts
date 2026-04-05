/** Signed-in “what are you looking for” destinations (`/intent/:slug`). */
export const INTENT_SLUGS = ["career", "location", "build"] as const;
export type IntentSlug = (typeof INTENT_SLUGS)[number];

export const INTENT_LABELS: Record<IntentSlug, string> = {
  career: "Career",
  location: "Location",
  build: "Build",
};

export function isIntentSlug(value: string): value is IntentSlug {
  return (INTENT_SLUGS as readonly string[]).includes(value);
}

/** Signed-in center nav order. `explore` is labeled “Explore” but routes to `/search` (directory), not `/intent/...`. */
export const NAV_INTENT_SLUGS = ["career", "location", "build", "explore"] as const;
export type NavIntentSlug = (typeof NAV_INTENT_SLUGS)[number];

export const NAV_INTENT_LABELS: Record<NavIntentSlug, string> = {
  career: "Career",
  location: "Location",
  build: "Build",
  explore: "Explore",
};
