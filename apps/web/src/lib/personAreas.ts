/** Areas of experience on a profile ("Pricing", "D2C growth"). Must match apps/api `lib/personAreas.ts`. */
export const PERSON_AREAS_MAX = 8;
export const PERSON_AREA_MAX_LENGTH = 40;
/** Suggestions start at two typed characters (the server returns nothing for less). */
export const AREA_SUGGESTION_MIN_QUERY = 2;

/** Turning one of these on is when adding areas pays off, so the editor suggests it then. */
export const AREAS_PROMPT_OPEN_TO = ["referrals", "mentorship", "advising"] as const;

export type AreaSuggestion = { label: string; memberCount: number };

/** Trim and collapse runs of spaces, tabs or newlines to one space. */
export function normalizeAreaLabel(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function areaKey(label: string): string {
  return normalizeAreaLabel(label).toLowerCase();
}

export function hasArea(areas: readonly string[], label: string): boolean {
  const key = areaKey(label);
  return areas.some((a) => areaKey(a) === key);
}

export type AddAreaResult =
  | { ok: true; areas: string[] }
  | { ok: false; reason: "empty" | "duplicate" | "too_long" | "full" };

/** Add one area to the draft list, or say why it can't be added. */
export function addArea(areas: readonly string[], raw: string): AddAreaResult {
  const label = normalizeAreaLabel(raw);
  if (!label) return { ok: false, reason: "empty" };
  if (label.length > PERSON_AREA_MAX_LENGTH) return { ok: false, reason: "too_long" };
  if (hasArea(areas, label)) return { ok: false, reason: "duplicate" };
  if (areas.length >= PERSON_AREAS_MAX) return { ok: false, reason: "full" };
  return { ok: true, areas: [...areas, label] };
}

export function removeArea(areas: readonly string[], label: string): string[] {
  const key = areaKey(label);
  return areas.filter((a) => areaKey(a) !== key);
}

export const ADD_AREA_MESSAGES: Record<Exclude<AddAreaResult, { ok: true }>["reason"], string> = {
  empty: "",
  duplicate: "You've already added that.",
  too_long: `Keep each area to ${PERSON_AREA_MAX_LENGTH} characters.`,
  full: `You can add up to ${PERSON_AREAS_MAX} areas.`,
};

/** The list as it will be saved: normalised, blanks and repeats dropped, order kept. */
export function normalizeAreasForSave(areas: readonly string[]): string[] {
  let out: string[] = [];
  for (const area of areas) {
    const next = addArea(out, area);
    if (next.ok) out = next.areas;
  }
  return out;
}

/** True when the draft would save something different from what's stored (order counts). */
export function areasChanged(saved: readonly string[], draft: readonly string[]): boolean {
  const next = normalizeAreasForSave(draft);
  return next.length !== saved.length || next.some((label, i) => label !== saved[i]);
}
