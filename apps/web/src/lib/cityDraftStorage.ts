/**
 * City draft board items live in this browser only. This keeps them across reloads so the
 * "saved on this device" copy is true. Everything is guarded: private mode, a full disk or
 * corrupt JSON must never break the page, they just mean no drafts are restored.
 */
export type CityDraftKind = "needs" | "events";

const MAX_DRAFTS = 50;

export function cityDraftsKey(owner: string, kind: CityDraftKind): string {
  return `alma.cityDrafts.v1.${owner}.${kind}`;
}

const NEED_TYPES = ["housing", "accommodation", "sports_activity", "city_help"];

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

/** Stored data is untrusted: an entry missing a field the board reads (city, country, ...) must be dropped, not rendered. */
function isDraftOf(kind: CityDraftKind, item: unknown): boolean {
  if (!item || typeof item !== "object") return false;
  const o = item as Record<string, unknown>;
  if (!isStr(o.id) || !isStr(o.city) || !isStr(o.country) || !isStr(o.title)) return false;
  if (kind === "events") {
    return isStr(o.startsAtLabel) && isStr(o.venue) && typeof o.attendeeCount === "number";
  }
  return (
    isStr(o.type) &&
    NEED_TYPES.includes(o.type) &&
    isStr(o.askedByName) &&
    isStr(o.askedByDepartmentCode) &&
    typeof o.askedByBatchYear === "number" &&
    isStr(o.description) &&
    (o.askedByPersonId === undefined || isStr(o.askedByPersonId))
  );
}

export function loadCityDrafts<T extends { id: string }>(owner: string, kind: CityDraftKind): T[] {
  try {
    const raw = window.localStorage.getItem(cityDraftsKey(owner, kind));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is T => isDraftOf(kind, item)).slice(0, MAX_DRAFTS);
  } catch {
    return [];
  }
}

export function saveCityDrafts<T extends { id: string }>(owner: string, kind: CityDraftKind, items: readonly T[]): void {
  try {
    const key = cityDraftsKey(owner, kind);
    if (items.length === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(items.slice(0, MAX_DRAFTS)));
  } catch {
    /* storage unavailable or full: drafts just stay in memory for this visit */
  }
}
