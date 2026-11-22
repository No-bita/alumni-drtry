/** Areas of experience on a profile ("Pricing", "D2C growth"). Must match apps/web `lib/personAreas.ts`. */
export const PERSON_AREAS_MAX = 8;
export const PERSON_AREA_MAX_LENGTH = 40;

/** Trim and collapse runs of spaces, tabs or newlines to one space. */
export function normalizeAreaLabel(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** The key two areas are compared by (the database derives the same key as lower(label)). */
export function areaKey(label: string): string {
  return normalizeAreaLabel(label).toLowerCase();
}

export type NormalizedAreas =
  | { ok: true; areas: string[] }
  | { ok: false; reason: "too_long" | "too_many" };

/**
 * A member's list as they'll be saved: spacing normalised, blanks dropped, repeats removed
 * (the first spelling wins), order kept. Refuses an area over 40 characters or more than 8 areas.
 */
export function normalizePersonAreas(raw: readonly string[]): NormalizedAreas {
  const areas: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const label = normalizeAreaLabel(value);
    if (!label) continue;
    if (label.length > PERSON_AREA_MAX_LENGTH) return { ok: false, reason: "too_long" };
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    areas.push(label);
  }
  if (areas.length > PERSON_AREAS_MAX) return { ok: false, reason: "too_many" };
  return { ok: true, areas };
}

/** Escape LIKE wildcards so a typed "%" or "_" is matched literally. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
