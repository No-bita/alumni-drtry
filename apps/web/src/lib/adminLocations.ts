import { api } from "../api/client";

/** Location cleanup (/admin/locations): turn what members typed into cities, and keep cities tidy. Admins only. */

export type Confidence = "high" | "medium" | "low";

/** Members' typed text with no city record, grouped ignoring capitals and spaces. */
export type UnlinkedTypedCity = {
  displayCity: string;
  displayCountry: string;
  normCountry: string;
  normCity: string;
  profiles: number;
  lastSeenAt: string | null;
  suggestedCityLabel: string | null;
  suggestedCountryLabel: string | null;
  suggestedTreatAsCityId: string | null;
  suggestionConfidence: Confidence | null;
};

export type MergeSuggestion = {
  country: string;
  cityOneLabel: string;
  cityTwoLabel: string;
  cityOneId: string;
  cityTwoId: string;
  usersAffected: number;
  confidence: Confidence;
  recommendedKeepCityId: string;
  recommendedCombineCityId: string;
  resultingCityLabel: string;
};

export type ApprovedCity = { id: string; city: string; country: string; linkedMembers: number };
export type Activity = { summary: string; at: string };

export type CleanupInbox = {
  suggestedMerges: MergeSuggestion[];
  unmappedClusters: UnlinkedTypedCity[];
  recentActivity: Activity[];
  approvedCities: ApprovedCity[];
};

export type PlaceDetail = {
  place: {
    id: string;
    displayCountry: string;
    displayCity: string;
    status: "pending" | "approved" | "rejected" | "combined";
    combinedIntoPlaceId: string | null;
  };
  aliases: string[];
  linkedProfiles: number;
  recentNotes: Activity[];
};

export type CitySearchHit = { id: string; city_label: string; country: string };

export const LOCATIONS_KEY = ["admin", "locations"] as const;
export const inboxKey = () => ["admin", "locations", "inbox"] as const;
export const placeKey = (id: string) => ["admin", "locations", "place", id] as const;
export const citySearchKey = (q: string) => ["admin", "locations", "search", q] as const;

export const CITY_NAME_MAX = 120;

export class AdminLocationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function fail(error: { code?: string; message?: string } | undefined, fallback: string): never {
  throw new AdminLocationError(error?.code ?? "UNKNOWN", error?.message ?? fallback);
}

export async function fetchInbox(signal?: AbortSignal): Promise<CleanupInbox> {
  const { data, error } = await api.get<CleanupInbox>("/v1/admin/locations/cleanup/inbox", { signal });
  if (error || !data) fail(error, "Couldn't load Location cleanup.");
  return { ...data, approvedCities: data.approvedCities ?? [] };
}

export async function fetchPlace(id: string, signal?: AbortSignal): Promise<PlaceDetail> {
  const { data, error } = await api.get<PlaceDetail>(`/v1/admin/locations/places/${id}`, { signal });
  if (error || !data) fail(error, "Couldn't load this city.");
  return data;
}

/** Approved cities by name or spelling (works whether or not city review is switched on). */
export async function searchCities(q: string, signal?: AbortSignal): Promise<CitySearchHit[]> {
  const params = new URLSearchParams({ q: q.trim(), limit: "12" });
  const { data, error } = await api.get<{ places: CitySearchHit[] }>(`/v1/admin/places?${params.toString()}`, { signal });
  if (error || !data) fail(error, "Couldn't search cities.");
  return data.places;
}

async function post<T>(url: string, body: unknown, fallback: string): Promise<T> {
  const { data, error } = await api.post<T>(url, body);
  if (error) fail(error, fallback);
  return (data ?? ({} as T)) as T;
}

/** Create a city from what members typed: a proper name, extra spellings; matching members are linked. */
export async function createCityFromTyped(input: {
  displayCountry: string;
  displayCity: string;
  cityLabel: string;
  extraSpellings: string[];
}): Promise<{ profilesUpdated: number; cityLabel: string; country: string; placeId: string }> {
  return post("/v1/admin/locations/cleanup/actions/create-city-from-text", input, "Couldn't create the city.");
}

/** Treat typed text as an existing city: the spelling is saved and the members who typed it are linked. */
export async function treatAsCity(input: { displayCountry: string; displayCity: string; treatAsCityId: string }): Promise<{ profilesUpdated: number }> {
  return post("/v1/admin/locations/cleanup/actions/map-free-text-to-city", input, "Couldn't link these members.");
}

export async function ignoreTyped(input: { displayCountry: string; displayCity: string }): Promise<void> {
  await post("/v1/admin/locations/cleanup/actions/ignore-unmapped-cluster", input, "Couldn't hide this.");
}

export async function createCity(input: { country: string; cityLabel: string; spellings: string[] }): Promise<{
  placeId: string;
  cityLabel: string;
  country: string;
  linkedMembers: number;
}> {
  return post("/v1/admin/locations/cities", input, "Couldn't add the city.");
}

export async function combineCities(keepCityId: string, combineCityId: string): Promise<{ linkedMembers: number }> {
  return post("/v1/admin/locations/cleanup/actions/combine-cities", { keepCityId, combineCityId }, "Couldn't combine these cities.");
}

export async function ignoreMerge(cityOneId: string, cityTwoId: string): Promise<void> {
  await post("/v1/admin/locations/cleanup/actions/ignore-merge-suggestion", { cityOneId, cityTwoId }, "Couldn't dismiss this.");
}

export async function addSpelling(placeId: string, spelling: string): Promise<{ linkedMembers: number }> {
  return post(`/v1/admin/locations/places/${placeId}/spelling-alias`, { spelling }, "Couldn't add the spelling.");
}

export async function renameCity(placeId: string, displayCity: string): Promise<{ linkedMembers: number }> {
  return post(`/v1/admin/locations/places/${placeId}/rename-display-city`, { displayCity }, "Couldn't rename the city.");
}

export async function combineInto(placeId: string, combineCityId: string): Promise<{ linkedMembers: number }> {
  return post(`/v1/admin/locations/places/${placeId}/combine-with-city`, { combineCityId }, "Couldn't combine the cities.");
}

/** "bangalore" -> "Bangalore", "NEW  DELHI" -> "New Delhi": a starting point the admin can edit. */
export function suggestCityName(typed: string): string {
  return typed
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** "blr, Bangalore ,  " -> ["blr", "Bangalore"] (no blanks, no repeats ignoring capitals). */
export function parseSpellings(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const s = part.trim().replace(/\s+/g, " ");
    if (!s || s.length > CITY_NAME_MAX) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out.slice(0, 20);
}

export function linkedText(n: number): string {
  return n === 0 ? "No members to link yet." : `Linked ${n} ${n === 1 ? "member" : "members"}.`;
}

export function locationErrorMessage(err: unknown): string {
  const code = err instanceof AdminLocationError ? err.code : "UNKNOWN";
  if (code === "CANONICAL_PLACE_EXISTS") return "That city already exists in this country. Use “Same city as…” to link these members to it.";
  if (code === "CITY_EXISTS_IN_REVIEW") return err instanceof Error ? err.message : "That city is waiting in City review.";
  if (code === "CITY_NAME_TAKEN") return "A city with that name already exists in this country.";
  if (code === "CITY_INVALID_TARGET") return "Pick an approved city.";
  if (code === "CITY_ALREADY_COMBINED") return "That city was already combined into another. Refresh and try again.";
  if (code === "PLACE_ALIAS_DUPLICATE") return "That spelling is already saved for this city.";
  if (code === "AUTH_FORBIDDEN") return "This needs an admin account.";
  return err instanceof Error && err.message ? err.message : "That didn't go through. Try again.";
}

export function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
