import { api, type ApiError } from "../api/client";
import { assertApiGet } from "./assertApiGet";
import { normalizeCityIntentSlug } from "./cityIntentFromToolbar";

/* Wire shapes: docs/cities-v1-contract.md */

export type CityRef = { placeId: string; city: string; country: string; slug: string };
export type CityListItem = CityRef & { count: number };

export type CityPerson = {
  id: string;
  fullName: string;
  batchYear: number | null;
  departmentCode: string | null;
  departmentName: string | null;
  roleTitle: string | null;
  organizationName: string | null;
};

export type NoteStatus = "pending" | "accepted" | "declined";

export type CoffeeState = {
  open: boolean;
  limit: number | null;
  spotsLeft: number | null;
  askedByMe: boolean;
};

export type CityAlum = { person: CityPerson; sharedTag: string | null; coffee: CoffeeState };
export type ReplyStats = { total: number; replied: number; medianDays: number | null };
export type CityHelper = CityAlum & {
  replyStats: ReplyStats | null;
  yourCityAsk: { status: NoteStatus; createdAt: string } | null;
};

export type CityArrival = {
  id: string;
  person: CityPerson;
  arrivedDaysAgo: number;
  previousCity: string | null;
  myOffer: { id: string } | null;
  wroteToMe: { contactRequestId: string; status: NoteStatus } | null;
};

export const HELP_KINDS = ["areas", "commute", "coffee", "intros"] as const;
export type HelpKind = (typeof HELP_KINDS)[number];

export type NewcomerOffer = {
  id: string;
  offerer: CityPerson;
  kinds: HelpKind[];
  line: string | null;
  createdAt: string;
  seen: boolean;
  myNote: { contactRequestId: string; status: NoteStatus } | null;
};

export type CityPost = {
  id: string;
  authorPersonId: string;
  authorFullName: string;
  authorBatchYear: number | null;
  content: string;
  createdAt: string;
  viewerHasResponded: boolean;
  isMine: boolean;
};

export type ViewerRole = "local" | "newcomer" | "arriver" | "no_city";
export type NudgeFrequency = "weekly" | "monthly" | "never";

export type CityPayload = {
  place: CityRef;
  viewerRole: ViewerRole;
  viewerCity: CityRef | null;
  v1Enabled: boolean;
  counts: { alumni: number; openToCityHelp: number };
  arrivalPrompt: boolean;
  nudgeFrequency: NudgeFrequency;
  arrivals: { total: number; items: CityArrival[] } | null;
  myArrival: { id: string; visibleUntil: string; daysLeft: number; previousCity: string | null } | null;
  offers: NewcomerOffer[];
  helpPanel: {
    askCount30d: number | null;
    pendingNotesForMe: number;
    cityHelpOn: boolean;
    openToCount: number;
  } | null;
  alumni: { total: number; items: CityAlum[] } | null;
  posts: CityPost[];
  chapterLink: { url: string; label: string } | null;
  helpers: CityHelper[];
  others: CityAlum[];
  pendingCityAsks: number;
  country: { name: string; alumni: number } | null;
};

export type CitiesList = { viewerCity: CityRef | null; cities: CityListItem[] };

export const ALUMNI_FILTERS = [
  { id: "batch", label: "Near your batch" },
  { id: "department", label: "Your department" },
  { id: "company", label: "Your company" },
  { id: "coffee", label: "Open to coffee" },
] as const;
export type AlumniFilter = (typeof ALUMNI_FILTERS)[number]["id"];
export type AlumniPage = { items: CityAlum[]; total: number; nextCursor: string | null };

/* Limits (mirrors the API; the server re-checks every one). */
export const COFFEE_REASON_MIN = 40;
export const COFFEE_REASON_MAX = 500;
export const OFFER_LINE_MAX = 160;
export const CITY_ASK_PENDING_MAX = 3;
/** "New in [city]" and the arriver list show this many before "See all". */
export const ARRIVALS_PREVIEW = 2;
export const ALUMNI_PREVIEW = 4;

/* Query keys */
export const CITIES_KEY = ["cities"] as const;
export const citiesKeys = {
  list: () => ["cities", "list"] as const,
  city: (placeId: string) => ["cities", "city", placeId] as const,
  alumni: (placeId: string, filter: AlumniFilter) => ["cities", "alumni", placeId, filter] as const,
  search: (q: string) => ["cities", "search", q.trim().toLowerCase()] as const,
};

/* Reads */
export function fetchCities(signal: AbortSignal): Promise<CitiesList> {
  return assertApiGet<CitiesList>("/v1/cities", signal);
}

export function fetchCity(placeId: string, signal: AbortSignal): Promise<CityPayload> {
  return assertApiGet<CityPayload>(`/v1/cities/${encodeURIComponent(placeId)}`, signal);
}

export function fetchCityAlumni(
  placeId: string,
  filter: AlumniFilter,
  cursor: string | null,
  signal: AbortSignal,
): Promise<AlumniPage> {
  const params = new URLSearchParams({ filter });
  if (cursor) params.set("cursor", cursor);
  return assertApiGet<AlumniPage>(`/v1/cities/${encodeURIComponent(placeId)}/alumni?${params.toString()}`, signal);
}

export async function searchCities(q: string, signal: AbortSignal): Promise<CityRef[]> {
  const params = new URLSearchParams({ q: q.trim() });
  return (await assertApiGet<{ places: CityRef[] }>(`/v1/cities/search?${params.toString()}`, signal)).places;
}

/* Writes. Each returns the API error (or null) so sheets can show their own copy. */
type Result<T = unknown> = { data?: T; error: ApiError | null };
const done = <T,>(r: { data?: T; error?: ApiError }): Result<T> => ({ data: r.data, error: r.error ?? null });

export const optInArrival = async (placeId: string) =>
  done(await api.post<{ arrival: { id: string; visibleUntil: string } }>("/v1/cities/arrivals", { placeId }));
export const endArrival = async () => done(await api.post("/v1/cities/arrivals/end"));
export const sendOffer = async (arrivalId: string, kinds: HelpKind[], line: string) =>
  done(
    await api.post<{ offer: { id: string } }>(`/v1/cities/arrivals/${encodeURIComponent(arrivalId)}/offers`, {
      kinds,
      ...(line.trim() ? { line: line.trim() } : {}),
    }),
  );
export const withdrawOffer = async (offerId: string) =>
  done(await api.delete(`/v1/cities/offers/${encodeURIComponent(offerId)}`));
export const markOffersSeen = async () => done(await api.post("/v1/cities/offers/seen"));
export const setNudgeFrequency = async (frequency: NudgeFrequency) =>
  done(await api.patch<{ frequency: NudgeFrequency }>("/v1/me/city-nudge", { frequency }));

export type CityNoteCategory = "coffee" | "relocation" | "visiting" | "newcomer";
export const sendCityNote = async (input: {
  recipientPersonId: string;
  message: string;
  category: CityNoteCategory;
  cityHelpOfferId?: string;
}) =>
  done(
    await api.post("/v1/contact-requests", {
      recipientPersonId: input.recipientPersonId,
      message: input.message,
      source: "cities",
      sourceCategory: input.category,
      ...(input.cityHelpOfferId ? { cityHelpOfferId: input.cityHelpOfferId } : {}),
    }),
  );

/** PATCH /v1/me/profile response, including the newcomer prompt after a city change. */
export type ArrivalPrompt = { placeId: string; cityName: string };
export type ProfilePatchResponse = { profile?: unknown; arrivalPrompt?: ArrivalPrompt | null };

/* Copy helpers */
export const HELP_KIND_LABELS: Record<HelpKind, string> = {
  areas: "Areas to live",
  commute: "Commute",
  coffee: "Coffee",
  intros: "Intros to local alumni",
};

export function firstName(fullName: string | null | undefined): string {
  return fullName?.trim().split(/\s+/)[0] || "them";
}

export function initials(fullName: string | null | undefined): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

export const yy = (y: number | null | undefined) => (y ? `’${String(y).slice(-2)}` : "");

/** "’22 · Computer Science" */
export function batchDeptLine(p: CityPerson): string {
  return [yy(p.batchYear), p.departmentName?.trim() || p.departmentCode?.toUpperCase() || ""].filter(Boolean).join(" · ");
}

/** "Product Analyst at Swiggy" */
export function roleLine(p: CityPerson): string {
  const role = p.roleTitle?.trim();
  const org = p.organizationName?.trim();
  if (role && org) return `${role} at ${org}`;
  return role || org || "";
}

/** "Arrived 6 days ago" / "Arrived today" / "Arrived 2 weeks ago". */
export function arrivedLabel(days: number): string {
  if (days <= 0) return "Arrived today";
  if (days === 1) return "Arrived yesterday";
  if (days < 14) return `Arrived ${days} days ago`;
  const weeks = Math.floor(days / 7);
  return `Arrived ${weeks} weeks ago`;
}

export function joinKinds(kinds: readonly HelpKind[]): string {
  const labels = kinds.map((k) => HELP_KIND_LABELS[k].toLowerCase());
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** What a row in "Alumni in [city]" offers the viewer. Never a message button unless they're open to coffee. */
export type CoffeeButton = "ask" | "full" | "sent" | "view";
export function coffeeButton(c: CoffeeState): CoffeeButton {
  if (!c.open) return "view";
  if (c.askedByMe) return "sent";
  if ((c.spotsLeft ?? 0) <= 0) return "full";
  return "ask";
}

export function spotsLeftLabel(n: number): string {
  return `${n} ${n === 1 ? "spot" : "spots"} left this week`;
}

/** Tag line under a row: shared thing, then coffee capacity when it applies. */
export function alumTagLine(a: CityAlum): string {
  const parts = [a.sharedTag ?? ""];
  const b = coffeeButton(a.coffee);
  if (b === "ask") parts.push(`Coffee: ${spotsLeftLabel(a.coffee.spotsLeft ?? 0)}`);
  else if (a.coffee.open) parts.push("Open to coffee");
  return parts.filter(Boolean).join(" · ");
}

export const WHEN_SUITS = ["Weekday evening", "Weekend", "A call is fine"] as const;
export type WhenSuits = (typeof WHEN_SUITS)[number];

/** The coffee ask as sent: the reason, then the optional "When suits me" line. */
export function coffeeAskMessage(reason: string, when: WhenSuits | null): string {
  const r = reason.trim();
  return when ? `${r}\n\nWhen suits me: ${when}` : r;
}

export const CITY_NEEDS = ["Areas to live", "Commute", "Flatmates", "Schools", "Other"] as const;
export type CityNeed = (typeof CITY_NEEDS)[number];
export type CityAskMode = "moving" | "visiting";

/** Arriver note: when + one specific need, filled in for the sender to edit. */
export function cityAskStarter(input: {
  mode: CityAskMode;
  city: string;
  when: string;
  need: CityNeed;
  otherNeed: string;
}): string {
  const need = input.need === "Other" ? input.otherNeed.trim() : input.need.toLowerCase();
  const head =
    input.mode === "moving"
      ? `I’m moving to ${input.city}${input.when ? ` in ${input.when}` : ""}.`
      : `I’m visiting ${input.city}${input.when ? ` ${input.when}` : ""}.`;
  return `${head} Could you help with ${need || "one thing"}? `;
}

export function cityAskMessage(input: {
  mode: CityAskMode;
  when: string;
  need: CityNeed;
  otherNeed: string;
  note: string;
}): string {
  const need = input.need === "Other" ? `Other: ${input.otherNeed.trim()}` : input.need;
  const lines = [input.note.trim(), "", `${input.mode === "moving" ? "Moving" : "Visiting"}: ${input.when}`, `Need: ${need}`];
  return lines.join("\n");
}

/** Newcomer → local who offered. */
export function newcomerNotePrefill(kinds: readonly HelpKind[], previousCity: string | null): string {
  const from = previousCity?.trim() ? ` from ${previousCity.trim()}` : "";
  return `Thanks for offering to help with ${joinKinds(kinds)}. I’ve just moved${from} for `;
}

/** Month options for "When are you moving?": this month and the next five. */
export function nextMonths(now = new Date(), count = 6): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push(d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }));
  }
  return out;
}

/** Profile edit, open-to editor, with a line explaining the 5-tag cap (Profile reads `limit=city_help`). */
export const openToCapPath = (profileId: string) => `/profiles/${profileId}?edit=open-to&limit=city_help`;

export function cityPath(city: Pick<CityRef, "slug" | "city">): string {
  return `/intent/location/${city.slug || normalizeCityIntentSlug(city.city)}`;
}

/** Slug in the URL → a city from GET /v1/cities (Bangalore resolves to Bengaluru). */
export function findCityBySlug(list: CitiesList | undefined, slug: string | undefined): CityRef | null {
  if (!list || !slug) return null;
  const s = normalizeCityIntentSlug(slug);
  const wanted = s === "bangalore" ? "bengaluru" : s;
  const all: CityRef[] = [...list.cities, ...(list.viewerCity ? [list.viewerCity] : [])];
  return all.find((c) => c.slug === wanted || normalizeCityIntentSlug(c.city) === wanted) ?? null;
}

/** Error code → member-facing copy for city notes. */
export function cityNoteError(code: string | undefined, name: string, message?: string): string {
  switch (code) {
    case "COFFEE_LIMIT_REACHED":
      return `${name} is full this week. Try again from Monday.`;
    case "COFFEE_NOT_OPEN":
      return `${name} isn’t taking coffee asks right now.`;
    case "COFFEE_REASON_TOO_SHORT":
      return `Say why ${name}, in at least ${COFFEE_REASON_MIN} characters.`;
    case "CITY_HELP_NOT_OPEN":
      return `${name} isn’t open to city help right now.`;
    case "CITY_ASK_LIMIT":
      return `You have ${CITY_ASK_PENDING_MAX} asks waiting. Send more once they reply.`;
    case "OFFER_NOT_FOUND":
      return "That offer isn’t available any more.";
    case "CONTACT_REQUEST_DUPLICATE_PENDING":
      return message ?? `You already have a note waiting for ${name}.`;
    case "CONTACT_REQUEST_RATE_LIMITED":
      return "You’ve sent a lot of notes recently. Try again later.";
    case "DEMO_READ_ONLY":
      return "Demo accounts can’t send notes.";
    case "NETWORK_ERROR":
      return message ?? "We couldn’t reach the server.";
    default:
      return "Couldn’t send. Try again.";
  }
}

/** Notifications: what a Cities note is about, by category. */
export function cityNoteKindLabel(category: string | null | undefined): string | null {
  switch (category) {
    case "coffee":
      return "asked you for coffee";
    case "relocation":
      return "asked for help moving to your city";
    case "visiting":
      return "asked for help with a visit to your city";
    case "newcomer":
      return "wrote back to your offer to help";
    default:
      return null;
  }
}
