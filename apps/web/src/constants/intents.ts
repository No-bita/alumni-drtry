/** Signed-in “what are you looking for” destinations (`/intent/:slug`). */
export const INTENT_SLUGS = ["career", "location", "business"] as const;
export type IntentSlug = (typeof INTENT_SLUGS)[number];

export const INTENT_LABELS: Record<IntentSlug, string> = {
  career: "Careers",
  location: "Cities",
  business: "Business",
};

export function isIntentSlug(value: string): value is IntentSlug {
  return (INTENT_SLUGS as readonly string[]).includes(value);
}
