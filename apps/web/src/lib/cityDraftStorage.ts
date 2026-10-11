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

export function loadCityDrafts<T extends { id: string }>(owner: string, kind: CityDraftKind): T[] {
  try {
    const raw = window.localStorage.getItem(cityDraftsKey(owner, kind));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is T => Boolean(item) && typeof item === "object" && typeof (item as { id?: unknown }).id === "string")
      .slice(0, MAX_DRAFTS);
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
