import { api } from "../api/client";

/** GET /v1/admin/cities/review: a pending or rejected city. The submitter's email arrives masked. */
export type ReviewCity = {
  id: string;
  city: string;
  country: string;
  status: "pending" | "rejected";
  linkedMembers: number;
  submittedByEmailMasked: string | null;
  submittedAt: string | null;
  aliases: string[];
  rejectionReason: string | null;
  reviewedAt: string | null;
};

export type ApprovedCityOption = { id: string; city: string; country: string };

export type CityHistoryEntry = {
  id: string;
  placeId: string;
  city: string;
  country: string;
  action: string;
  actorName: string | null;
  targetCity: string | null;
  reason: string | null;
  summary: string;
  at: string;
};

export type ReviewTab = "pending" | "rejected";

export const CITY_NAME_MAX = 120;
export const REJECT_REASON_MIN = 3;
export const REJECT_REASON_MAX = 500;

export const ADMIN_CITIES_KEY = ["admin", "cities"] as const;
export const reviewCitiesKey = (tab: ReviewTab, q: string) => ["admin", "cities", "review", tab, q] as const;
export const approvedCitiesKey = (q: string, exclude: string) => ["admin", "cities", "approved", q, exclude] as const;
export const cityHistoryKey = (placeId: string | null) => ["admin", "cities", "history", placeId ?? "all"] as const;

export class AdminCityError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function fail(error: { code?: string; message?: string } | undefined, fallback: string): never {
  throw new AdminCityError(error?.code ?? "UNKNOWN", error?.message ?? fallback);
}

export async function fetchReviewCities(tab: ReviewTab, q: string, signal?: AbortSignal): Promise<ReviewCity[]> {
  const params = new URLSearchParams({ status: tab });
  if (q.trim()) params.set("q", q.trim());
  const { data, error } = await api.get<{ cities: ReviewCity[] }>(`/v1/admin/cities/review?${params.toString()}`, { signal });
  if (error || !data) fail(error, "Couldn't load the cities.");
  return data.cities;
}

export async function searchApprovedCities(q: string, excludeId: string, signal?: AbortSignal): Promise<ApprovedCityOption[]> {
  const params = new URLSearchParams({ q: q.trim(), exclude: excludeId });
  const { data, error } = await api.get<{ cities: ApprovedCityOption[] }>(`/v1/admin/cities/approved?${params.toString()}`, { signal });
  if (error || !data) fail(error, "Couldn't search cities.");
  return data.cities;
}

export async function fetchCityHistory(placeId: string | null, signal?: AbortSignal): Promise<CityHistoryEntry[]> {
  const url = placeId ? `/v1/admin/cities/${placeId}/history` : `/v1/admin/cities/history?limit=25`;
  const { data, error } = await api.get<{ history: CityHistoryEntry[] }>(url, { signal });
  if (error || !data) fail(error, "Couldn't load the history.");
  return data.history;
}

export async function approveCity(id: string, cityLabel: string | null): Promise<void> {
  const { error } = await api.post(`/v1/admin/cities/${id}/approve`, cityLabel ? { cityLabel } : {});
  if (error) fail(error, "That didn't go through. Try again.");
}

export async function rejectCity(id: string, reason: string): Promise<void> {
  const { error } = await api.post(`/v1/admin/cities/${id}/reject`, { reason });
  if (error) fail(error, "That didn't go through. Try again.");
}

export async function reopenCity(id: string): Promise<void> {
  const { error } = await api.post(`/v1/admin/cities/${id}/reopen`);
  if (error) fail(error, "That didn't go through. Try again.");
}

export async function sameCityAs(id: string, targetPlaceId: string): Promise<void> {
  const { error } = await api.post(`/v1/admin/cities/${id}/same-as`, { targetPlaceId });
  if (error) fail(error, "That didn't go through. Try again.");
}

/** What to tell the admin when an action fails. */
export function cityReviewErrorMessage(err: unknown): { message: string; refresh: boolean } {
  const code = err instanceof AdminCityError ? err.code : "UNKNOWN";
  if (code === "CITY_NOT_PENDING" || code === "CITY_NOT_REJECTED" || code === "CITY_NOT_FOUND" || code === "CITY_ALREADY_COMBINED") {
    return { message: "Someone already reviewed this city. Refreshing the list.", refresh: true };
  }
  if (code === "CITY_NAME_TAKEN") {
    return { message: "A city with that name already exists in this country. Use “Same city as…” instead.", refresh: false };
  }
  if (code === "CITY_INVALID_TARGET") return { message: "Pick an approved city.", refresh: false };
  if (code === "CITY_REJECT_REASON_REQUIRED") {
    return { message: `Give a reason (${REJECT_REASON_MIN} to ${REJECT_REASON_MAX} characters).`, refresh: false };
  }
  if (code === "AUTH_FORBIDDEN") return { message: "This needs an admin account.", refresh: false };
  return { message: err instanceof Error && err.message ? err.message : "That didn't go through. Try again.", refresh: false };
}

export function formatCityDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
