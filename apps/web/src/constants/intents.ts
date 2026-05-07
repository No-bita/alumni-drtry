/** Signed-in “what are you looking for” destinations (`/intent/:slug`). */
export const INTENT_SLUGS = ["career", "location", "build"] as const;
export type IntentSlug = (typeof INTENT_SLUGS)[number];

export const INTENT_LABELS: Record<IntentSlug, string> = {
  career: "Careers",
  location: "Cities",
  build: "Build",
};

export function isIntentSlug(value: string): value is IntentSlug {
  return (INTENT_SLUGS as readonly string[]).includes(value);
}

/** Signed-in center nav order. `events` routes to `/events` (not `/intent/...`). */
export const NAV_INTENT_SLUGS = ["career", "location", "build", "events"] as const;
export type NavIntentSlug = (typeof NAV_INTENT_SLUGS)[number];

export const NAV_INTENT_LABELS: Record<NavIntentSlug, string> = {
  career: "Careers",
  location: "Cities",
  build: "Build",
  events: "Events",
};
