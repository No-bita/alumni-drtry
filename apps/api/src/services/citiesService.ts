import type { Pool } from "pg";
import { env } from "../config/env.js";
import { hashSecret } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { rankMatches } from "../lib/matchScore.js";
import type { MatchIntent } from "../lib/matchIntent.js";
import { coffeeWeeklyLimit, parseOpenToPreferences } from "../lib/openToPreferences.js";
import {
  CitiesRepo,
  type CityAlumniFilter,
  type CityAlumRow,
  type PersonCardRow,
  type PlaceRow,
  type ViewerFacts
} from "../repos/citiesRepo.js";
import { MatchRepo } from "../repos/matchRepo.js";
import { buildCandidateQuery, MATCH_CANDIDATE_LIMIT } from "./matchService.js";
import type { ReplyStatsView } from "./contactRequestService.js";
import type { ArrivalPrompt, ResidenceSync } from "./profileService.js";
import type { EmailSender } from "./emailSender.js";
import { clearResidenceCitiesCache } from "./discoveryService.js";

/* ---------------------------------------------------------------------- */
/* Rules (SPEC §11 "proposed", confirmed)                                  */
/* ---------------------------------------------------------------------- */

/** A newcomer is shown under "New in [city]" this long after opting in. */
export const ARRIVAL_WINDOW_DAYS = 30;
/** The opt-in is offered for this long after a move. */
export const ARRIVAL_PROMPT_DAYS = 30;
/** "Near your batch": within this many batch years. */
export const BATCH_WINDOW_YEARS = 2;
/** "[N] moving-help searches" looks back this far, and hides below the minimum. */
export const ASK_COUNT_DAYS = 30;
export const ASK_COUNT_MIN_SHOWN = 3;
/** Limits on what the page lists. */
export const ARRIVALS_LISTED_MAX = 50;
export const ALUMNI_PREVIEW = 4;
export const ALUMNI_PAGE = 20;
export const POSTS_PREVIEW = 3;
export const HELPERS_MAX = 20;
export const OTHERS_PREVIEW = 4;
export const CITIES_LIST_MAX = 120;
export const OFFER_LINE_MAX = 160;
export const HELP_KINDS = ["areas", "commute", "coffee", "intros"] as const;
export type HelpKind = (typeof HELP_KINDS)[number];

/* ---------------------------------------------------------------------- */
/* Wire shapes (docs/cities-v1-contract.md)                                */
/* ---------------------------------------------------------------------- */

export type CityRef = { placeId: string; city: string; country: string; slug: string };
export type CityPerson = {
  id: string;
  fullName: string;
  batchYear: number | null;
  departmentCode: string | null;
  departmentName: string | null;
  roleTitle: string | null;
  organizationName: string | null;
};
type NoteStatus = "pending" | "accepted" | "declined";
export type CoffeeState = { open: boolean; limit: number | null; spotsLeft: number | null; askedByMe: boolean };
export type CityAlum = { person: CityPerson; sharedTag: string | null; coffee: CoffeeState };
export type CityHelper = CityAlum & {
  replyStats: ReplyStatsView | null;
  yourCityAsk: { status: NoteStatus; createdAt: string } | null;
};
export type ViewerRole = "local" | "newcomer" | "arriver" | "no_city";

export interface CitiesNoteInfo {
  replyStatsForRecipients(recipientPersonIds: readonly string[]): Promise<Map<string, ReplyStatsView>>;
}

export interface UsageEventLogger {
  logBetaUsageEvent(input: { eventType: "cities_nudge_sent"; personId: string; route: string; metadata?: Record<string, unknown> }): Promise<boolean>;
}

/** URL slug for a city: lowercase words joined by hyphens (same as the web's normalizeCityIntentSlug). */
export function citySlug(city: string): string {
  return city.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function cityRef(p: PlaceRow): CityRef {
  return { placeId: p.id, city: p.city, country: p.country, slug: citySlug(p.city) };
}

function toPerson(r: PersonCardRow): CityPerson {
  return {
    id: r.id,
    fullName: r.full_name,
    batchYear: r.batch_year,
    departmentCode: r.department_code,
    departmentName: r.department_name,
    roleTitle: r.role_title,
    organizationName: r.org_name
  };
}

/** The strongest thing a person shares with the viewer, in sort order: batch window, department, company. */
export function sharedTag(
  person: { batch_year: number | null; department_code: string | null; org_name: string | null; same_company?: boolean },
  viewer: ViewerFacts
): string | null {
  if (person.batch_year !== null && viewer.batchYear !== null) {
    const gap = Math.abs(person.batch_year - viewer.batchYear);
    if (gap === 0) return "Same batch";
    if (gap <= BATCH_WINDOW_YEARS) return `${gap} ${gap === 1 ? "batch" : "batches"} apart`;
  }
  if (person.department_code && viewer.departmentCode && person.department_code === viewer.departmentCode) {
    return "Same department";
  }
  const sameCompany =
    person.same_company ??
    Boolean(person.org_name && viewer.companyName && person.org_name.trim().toLowerCase() === viewer.companyName.trim().toLowerCase());
  if (sameCompany && viewer.companyName) return `Also at ${viewer.companyName}`;
  return null;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

/** Monday 10:00 Asia/Kolkata or later in the week (the nudge goes out from then). */
export function isNudgeTime(now: Date): boolean {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const dow = ist.getUTCDay(); // 0 Sunday … 1 Monday
  if (dow === 0) return true; // still the same Mon–Sun week
  return dow > 1 || ist.getUTCHours() >= 10;
}

type ChapterLinks = Record<string, { url: string; label: string }>;

function parseChapterLinks(raw: string | undefined): ChapterLinks {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: ChapterLinks = {};
    for (const [placeId, v] of Object.entries(parsed as Record<string, unknown>)) {
      const link = v as { url?: unknown; label?: unknown };
      if (typeof link?.url === "string" && /^https?:\/\//i.test(link.url) && typeof link.label === "string") {
        out[placeId] = { url: link.url, label: link.label };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Cities page (Bengaluru first): who lives in a city, who just arrived, and asks that pass the reach-out principle. */
export class CitiesService implements ResidenceSync {
  private readonly repo: CitiesRepo;
  private readonly matchRepo: MatchRepo;
  private v1Cache: { ids: string[]; at: number } | null = null;
  private readonly chapterLinks: ChapterLinks;

  constructor(
    pool: Pool,
    private readonly notes: CitiesNoteInfo,
    private readonly emailSender: EmailSender | null = null,
    private readonly usage: UsageEventLogger | null = null
  ) {
    this.repo = new CitiesRepo(pool);
    this.matchRepo = new MatchRepo(pool);
    this.chapterLinks = parseChapterLinks(env.CITY_CHAPTER_LINKS);
  }

  /* ------------------------------------------------------------------ */
  /* Which cities have the full v1 page                                  */
  /* ------------------------------------------------------------------ */

  /** CITIES_V1_PLACE_IDS, or Bengaluru (India) looked up by name when unset. Cached for 10 minutes. */
  async v1PlaceIds(): Promise<string[]> {
    if (this.v1Cache && Date.now() - this.v1Cache.at < 600_000) return this.v1Cache.ids;
    const configured = (env.CITIES_V1_PLACE_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    let ids = configured;
    if (ids.length === 0) {
      const blr = await this.repo.findPlaceByName("Bengaluru", "India");
      ids = blr ? [blr.id] : [];
    }
    this.v1Cache = { ids, at: Date.now() };
    return ids;
  }

  async isV1(placeId: string): Promise<boolean> {
    return (await this.v1PlaceIds()).includes(placeId);
  }

  /* ------------------------------------------------------------------ */
  /* Residence (called after a profile save that touched the city)       */
  /* ------------------------------------------------------------------ */

  async syncResidence(personId: string, before: { city: string | null; country: string | null }): Promise<ArrivalPrompt | null> {
    const res = await this.repo.residence(personId);
    if (!res) return null;
    const same = (a: string | null, b: string | null) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
    const textChanged = !same(before.city, res.city) || !same(before.country, res.country);
    const next = res.city?.trim()
      ? ((await this.repo.findPlaceByName(res.city, res.country)) ?? (await this.repo.findPlaceByName(res.city, null)))
      : null;
    const nextId = next?.id ?? null;
    if (nextId === res.placeId) return null;
    // The form sends the city on every save. When the typed city didn't change, only fill in a missing
    // place: never clear or move one (an admin may have mapped a spelling the lookup doesn't know).
    if (!textChanged && (res.placeId !== null || nextId === null)) return null;

    const moved = res.placeId !== null && nextId !== null;
    await this.repo.setResidencePlace(personId, nextId, moved ? { from: res.placeId! } : null);
    if (res.placeId !== null) {
      // Any change away from the city ends being "new in town" there.
      await this.repo.endArrival(personId, "moved");
    }
    clearResidenceCitiesCache();
    if (moved && next && (await this.isV1(next.id))) {
      return { placeId: next.id, cityName: next.city };
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Reads                                                               */
  /* ------------------------------------------------------------------ */

  async listCities(viewer: { personId: string; isDemo: boolean }) {
    const res = await this.repo.residence(viewer.personId);
    const [rows, mine] = await Promise.all([
      this.repo.listCities(viewer.isDemo, CITIES_LIST_MAX, res?.placeId ?? null),
      res?.placeId ? this.repo.placeById(res.placeId) : Promise.resolve(null)
    ]);
    return {
      viewerCity: mine ? cityRef(mine) : null,
      cities: rows.map((r) => ({ ...cityRef(r), count: r.count }))
    };
  }

  async searchPlaces(q: string) {
    return { places: (await this.repo.searchPlaces(q, 8)).map(cityRef) };
  }

  async city(placeId: string, viewer: { personId: string; isDemo: boolean }) {
    const place = await this.repo.placeById(placeId);
    if (!place) throw new AppError(404, "CITY_NOT_FOUND", "City not found.");

    const [res, v1, counts, arrival, nudgeFrequency] = await Promise.all([
      this.repo.residence(viewer.personId),
      this.isV1(place.id),
      this.repo.countAlumni(place.id, viewer.isDemo),
      this.repo.activeArrival(viewer.personId),
      this.repo.nudgeFrequency(viewer.personId)
    ]);
    const viewerPlace = res?.placeId ? await this.repo.placeById(res.placeId) : null;
    const viewerRole: ViewerRole = !viewerPlace
      ? "no_city"
      : viewerPlace.id === place.id
        ? arrival?.place_id === place.id
          ? "newcomer"
          : "local"
        : "arriver";

    const payload = {
      place: cityRef(place),
      viewerRole,
      viewerCity: viewerPlace ? cityRef(viewerPlace) : null,
      v1Enabled: v1,
      counts: { alumni: counts.alumni, openToCityHelp: counts.cityHelp },
      arrivalPrompt: false,
      nudgeFrequency,
      arrivals: null as null | { total: number; items: unknown[] },
      myArrival: null as null | { id: string; visibleUntil: string; daysLeft: number; previousCity: string | null },
      offers: [] as unknown[],
      helpPanel: null as null | {
        askCount30d: number | null;
        pendingNotesForMe: number;
        cityHelpOn: boolean;
        openToCount: number;
      },
      alumni: null as null | { total: number; items: CityAlum[] },
      posts: [] as unknown[],
      chapterLink: v1 ? (this.chapterLinks[place.id] ?? null) : null,
      helpers: [] as CityHelper[],
      others: [] as CityAlum[],
      pendingCityAsks: 0,
      country: null as null | { name: string; alumni: number }
    };

    const facts = await this.repo.viewerFacts(viewer.personId);

    if (viewerRole === "local" || viewerRole === "newcomer") {
      const alumni = await this.repo.listCityAlumni({
        placeId: place.id,
        viewerPersonId: viewer.personId,
        viewerIsDemo: viewer.isDemo,
        viewer: facts,
        batchWindow: BATCH_WINDOW_YEARS,
        filter: "batch",
        offset: 0,
        limit: ALUMNI_PREVIEW
      });
      payload.alumni = { total: alumni.total, items: await this.toAlumni(alumni.rows, facts, viewer.personId) };

      if (v1) {
        const [arrivals, recent, names, pending, prefsMap, posts] = await Promise.all([
          viewerRole === "local"
            ? this.repo.listActiveArrivals(place.id, viewer.personId, viewer.isDemo, ARRIVALS_LISTED_MAX)
            : Promise.resolve(null),
          this.repo.recentArrival(viewer.personId, place.id),
          this.repo.placeNames(place.id),
          this.repo.pendingNotesFor(viewer.personId),
          this.repo.openToPreferences([viewer.personId]),
          this.repo.cityPosts(place.id, viewer.personId, viewer.isDemo, POSTS_PREVIEW)
        ]);
        const now = new Date();
        if (arrivals) {
          payload.arrivals = {
            total: arrivals.total,
            items: arrivals.rows.map((a) => ({
              id: a.arrival_id,
              person: toPerson(a),
              arrivedDaysAgo: daysBetween(a.opted_in_at, now),
              previousCity: a.previous_city,
              myOffer: a.my_offer_id ? { id: a.my_offer_id } : null,
              wroteToMe: a.wrote_note_id && a.wrote_note_status ? { contactRequestId: a.wrote_note_id, status: a.wrote_note_status } : null
            }))
          };
        }
        if (recent) {
          // Offers stay visible to the newcomer after "Stop showing me as new" (until the 30 days end).
          const offers = await this.repo.listOffers(recent.id);
          payload.offers = offers.map((o) => ({
            id: o.offer_id,
            offerer: toPerson(o),
            kinds: o.kinds,
            line: o.line,
            createdAt: o.created_at.toISOString(),
            seen: o.seen_at !== null,
            myNote: o.note_id && o.note_status ? { contactRequestId: o.note_id, status: o.note_status } : null
          }));
          if (viewerRole === "newcomer" && recent.ended_at === null) {
            const prev = recent.previous_place_id ? await this.repo.placeById(recent.previous_place_id) : null;
            payload.myArrival = {
              id: recent.id,
              visibleUntil: recent.visible_until.toISOString(),
              daysLeft: Math.max(0, Math.ceil((recent.visible_until.getTime() - now.getTime()) / 86_400_000)),
              previousCity: prev?.city ?? null
            };
          }
        }
        const asks = await this.repo.askCount(names, place.country, ASK_COUNT_DAYS);
        const prefs = parseOpenToPreferences(prefsMap.get(viewer.personId));
        payload.helpPanel = {
          askCount30d: asks >= ASK_COUNT_MIN_SHOWN ? asks : null,
          pendingNotesForMe: pending,
          cityHelpOn: Boolean(prefs?.selected.includes("city_help")),
          openToCount: prefs?.selected.length ?? 0
        };
        payload.posts = posts.map((p) => ({
          id: p.id,
          authorPersonId: p.author_person_id,
          authorFullName: p.author_full_name,
          authorBatchYear: p.author_batch_year,
          content: p.content,
          createdAt: p.created_at.toISOString(),
          viewerHasResponded: p.viewer_has_responded,
          isMine: p.author_person_id === viewer.personId
        }));
        payload.arrivalPrompt =
          viewerRole === "local" &&
          res?.changedAt != null &&
          res.previousPlaceId != null &&
          daysBetween(res.changedAt, now) < ARRIVAL_PROMPT_DAYS &&
          !(await this.repo.hasArrivalSince(viewer.personId, res.changedAt));
      }
      return payload;
    }

    // Arriver (or no city on the profile): who helps people settle in, others they share something with.
    const helpers = await this.helpers(place, viewer, facts);
    payload.helpers = helpers;
    const others = await this.repo.listCityAlumni({
      placeId: place.id,
      viewerPersonId: viewer.personId,
      viewerIsDemo: viewer.isDemo,
      viewer: facts,
      batchWindow: BATCH_WINDOW_YEARS,
      filter: "shared",
      excludeIds: helpers.map((h) => h.person.id),
      offset: 0,
      limit: OTHERS_PREVIEW
    });
    payload.others = await this.toAlumni(others.rows, facts, viewer.personId);
    payload.pendingCityAsks = await this.repo.pendingCityHelpAsks(viewer.personId);
    if (counts.alumni === 0) {
      payload.country = { name: place.country, alumni: await this.repo.countAlumniInCountry(place.country, viewer.isDemo) };
    }
    await this.logDemand(place, viewer, helpers.length);
    return payload;
  }

  async alumni(
    placeId: string,
    viewer: { personId: string; isDemo: boolean },
    filter: Exclude<CityAlumniFilter, "shared" | "all">,
    offset: number
  ) {
    const place = await this.repo.placeById(placeId);
    if (!place) throw new AppError(404, "CITY_NOT_FOUND", "City not found.");
    const facts = await this.repo.viewerFacts(viewer.personId);
    const page = await this.repo.listCityAlumni({
      placeId,
      viewerPersonId: viewer.personId,
      viewerIsDemo: viewer.isDemo,
      viewer: facts,
      batchWindow: BATCH_WINDOW_YEARS,
      filter,
      offset,
      limit: ALUMNI_PAGE
    });
    const next = offset + page.rows.length;
    return {
      items: await this.toAlumni(page.rows, facts, viewer.personId),
      total: page.total,
      nextCursor: next < page.total ? String(next) : null
    };
  }

  /** People open to city help in the place, ranked with Ask's relocation scoring. */
  private async helpers(place: PlaceRow, viewer: { personId: string; isDemo: boolean }, facts: ViewerFacts): Promise<CityHelper[]> {
    const helperIds = await this.repo.cityHelperIds(place.id, viewer.personId, viewer.isDemo);
    if (helperIds.size === 0) return [];
    const names = await this.repo.placeNames(place.id);
    const intent: MatchIntent = {
      category: "relocation",
      company: null,
      role: null,
      fromRole: null,
      city: place.city,
      country: place.country,
      studyPrograms: [],
      keywords: [],
      source: "rules"
    };
    const query = buildCandidateQuery(
      intent,
      { organizations: [], places: [{ city: place.city, country: place.country, aliases: names }] },
      { viewerPersonId: viewer.personId, viewerIsDemo: viewer.isDemo }
    );
    const candidates = await this.matchRepo.findCandidates({ ...query, candidateLimit: MATCH_CANDIDATE_LIMIT });
    const ranked = rankMatches(
      intent,
      candidates.filter((c) => helperIds.has(c.personId)),
      HELPERS_MAX
    ).map((m) => m.candidate.personId);
    // Anyone the text match missed (e.g. a spelling only the place record knows) still counts.
    const order = [...ranked, ...[...helperIds].filter((id) => !ranked.includes(id))].slice(0, HELPERS_MAX);

    const [cards, stats, asks] = await Promise.all([
      this.repo.personCards(order),
      this.notes.replyStatsForRecipients(order),
      this.repo.latestCityAsksFrom(viewer.personId, order)
    ]);
    const rows = order.map((id) => cards.get(id)).filter((r): r is CityAlumRow => Boolean(r));
    const alumni = await this.toAlumni(rows, facts, viewer.personId);
    return alumni.map((a) => {
      const ask = asks.get(a.person.id);
      return {
        ...a,
        replyStats: stats.get(a.person.id) ?? null,
        yourCityAsk: ask ? { status: ask.status, createdAt: ask.createdAt.toISOString() } : null
      };
    });
  }

  private async toAlumni(rows: CityAlumRow[], facts: ViewerFacts, viewerPersonId: string): Promise<CityAlum[]> {
    const ids = rows.map((r) => r.id);
    const [used, asked] = await Promise.all([
      this.repo.coffeeAsksThisWeek(ids),
      this.repo.pendingCoffeeAsksFrom(viewerPersonId, ids)
    ]);
    return rows.map((r) => {
      const limit = coffeeWeeklyLimit(parseOpenToPreferences(r.open_to_preferences));
      return {
        person: toPerson(r),
        sharedTag: sharedTag(r, facts),
        coffee: {
          open: limit !== null,
          limit,
          spotsLeft: limit === null ? null : Math.max(0, limit - (used.get(r.id) ?? 0)),
          askedByMe: asked.has(r.id)
        }
      };
    });
  }

  /** An arriver view counts as demand for the city, once per viewer, city and day (no person id is stored). */
  private async logDemand(place: PlaceRow, viewer: { personId: string; isDemo: boolean }, resultCount: number): Promise<void> {
    if (viewer.isDemo || !env.MATCH_ANALYTICS_ENABLED) return;
    try {
      const day = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
      const key = hashSecret(`cities-demand|${viewer.personId}|${place.id}|${day}`, env.AUTH_SECRET_PEPPER);
      if (!(await this.repo.claimDemandKey(key))) return;
      await this.matchRepo.logQuery({
        category: "relocation",
        detectedFields: ["city"],
        parserSource: "cities",
        resultCount,
        hadOverrides: false,
        needsDetail: false,
        city: place.city,
        country: place.country
      });
    } catch {
      /* demand counting must never break the page */
    }
  }

  /* ------------------------------------------------------------------ */
  /* Arrivals and offers                                                 */
  /* ------------------------------------------------------------------ */

  async optIn(personId: string, placeId: string) {
    const res = await this.repo.residence(personId);
    const eligible =
      res?.placeId === placeId &&
      res.changedAt != null &&
      res.previousPlaceId != null &&
      daysBetween(res.changedAt, new Date()) < ARRIVAL_PROMPT_DAYS &&
      (await this.isV1(placeId)) &&
      !(await this.repo.hasArrivalSince(personId, res.changedAt));
    if (!eligible) {
      throw new AppError(409, "ARRIVAL_NOT_ELIGIBLE", "You can show yourself as new only right after moving to this city.");
    }
    if (await this.repo.activeArrival(personId)) {
      throw new AppError(409, "ARRIVAL_NOT_ELIGIBLE", "You're already shown as new in town.");
    }
    // Close any arrival whose window ran out so the one-active-arrival index stays clear.
    await this.repo.endArrival(personId, "expired");
    const arrival = await this.repo.createArrival(personId, placeId, res!.previousPlaceId, ARRIVAL_WINDOW_DAYS);
    return { id: arrival.id, visibleUntil: arrival.visible_until.toISOString() };
  }

  async endArrival(personId: string): Promise<void> {
    await this.repo.endArrival(personId, "stopped");
  }

  async offer(offererPersonId: string, arrivalId: string, kinds: HelpKind[], line: string | null) {
    const arrival = await this.repo.arrivalById(arrivalId);
    if (!arrival || arrival.ended_at !== null || arrival.visible_until.getTime() <= Date.now()) {
      throw new AppError(404, "OFFER_NOT_FOUND", "They're no longer shown as new in town.");
    }
    if (arrival.person_id === offererPersonId) {
      throw new AppError(403, "OFFER_NOT_LOCAL", "You can't offer help to yourself.");
    }
    const res = await this.repo.residence(offererPersonId);
    if (res?.placeId !== arrival.place_id) {
      throw new AppError(403, "OFFER_NOT_LOCAL", "Only alumni who live in this city can offer help.");
    }
    const uniqueKinds = [...new Set(kinds)];
    const cleanLine = line?.trim() ? line.trim().slice(0, OFFER_LINE_MAX) : null;
    const created = await this.repo.createOffer(arrival.id, offererPersonId, uniqueKinds, cleanLine);
    if (!created) throw new AppError(409, "OFFER_DUPLICATE", "You've already offered to help them.");
    return { id: created.id };
  }

  async withdrawOffer(personId: string, offerId: string): Promise<void> {
    if (!(await this.repo.withdrawOffer(offerId, personId))) {
      throw new AppError(404, "OFFER_NOT_FOUND", "Offer not found.");
    }
  }

  async markOffersSeen(personId: string): Promise<void> {
    await this.repo.markOffersSeen(personId);
  }

  async offerNotifications(personId: string, limit: number) {
    return this.repo.offerNotifications(personId, limit);
  }

  async countOfferNotifications(personId: string) {
    return this.repo.countOfferNotifications(personId);
  }

  async setNudgeFrequency(personId: string, frequency: "weekly" | "monthly" | "never") {
    await this.repo.setNudgeFrequency(personId, frequency);
    return frequency;
  }

  /* ------------------------------------------------------------------ */
  /* Nudge email                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Weekly "what's new in your city" email (Monday from 10:00 IST, on the hourly tick). Sent only when
   * there is a new opted-in arrival or a new city post since that person's last nudge. Claims are atomic.
   */
  async sendNudges(now = new Date()): Promise<{ sent: number; skipped: number; failed: number }> {
    const totals = { sent: 0, skipped: 0, failed: 0 };
    if (!this.emailSender || !isNudgeTime(now)) return totals;
    const placeIds = await this.v1PlaceIds();
    if (placeIds.length === 0) return totals;
    await this.repo.purgeDemandKeys().catch(() => undefined);

    const askCounts = new Map<string, number | null>();
    for (const placeId of placeIds) {
      const place = await this.repo.placeById(placeId);
      const n = place ? await this.repo.askCount(await this.repo.placeNames(placeId), place.country, ASK_COUNT_DAYS) : 0;
      askCounts.set(placeId, n >= ASK_COUNT_MIN_SHOWN ? n : null);
    }

    const recipients = await this.repo.nudgeRecipients(placeIds, 500);
    for (const r of recipients) {
      const arrivals = (await this.repo.arrivalsSince(r.place_id, r.last_sent_at, 4)).filter((a) => a.id !== r.id).slice(0, 3);
      const posts = (await this.repo.cityPosts(r.place_id, r.id, false, 5, r.last_sent_at)).filter((p) => p.author_person_id !== r.id);
      if (arrivals.length === 0 && posts.length === 0) {
        totals.skipped += 1;
        continue;
      }
      if (!(await this.repo.claimNudge(r.id))) continue;
      const askCount = askCounts.get(r.place_id) ?? null;
      try {
        await this.emailSender.sendCityNudgeEmail({
          to: r.institutional_email,
          recipientName: r.full_name?.trim() || "there",
          city: r.city,
          subject: nudgeSubject(r.city, arrivals.length, askCount),
          arrivals: arrivals.map((a) => ({
            name: a.full_name,
            batchYear: a.batch_year,
            department: a.department_code?.toUpperCase() ?? null,
            roleTitle: a.role_title,
            organizationName: a.org_name,
            previousCity: a.previous_city
          })),
          askCount,
          showCityHelp: !r.city_help_on,
          plans: posts.slice(0, 3).map((p) => firstLine(p.content)),
          pageUrl: `${env.APP_BASE_URL.replace(/\/+$/, "")}/intent/location?via=nudge`,
          manageUrl: `${env.APP_BASE_URL.replace(/\/+$/, "")}/intent/location?emails=manage`
        });
        totals.sent += 1;
        void this.usage
          ?.logBetaUsageEvent({ eventType: "cities_nudge_sent", personId: r.id, route: "job:city-nudge" })
          .catch(() => undefined);
      } catch (err) {
        totals.failed += 1;
        await this.repo.releaseNudge(r.id, r.last_sent_at);
        console.error("[cities] nudge email failed (will retry next tick):", err);
      }
    }
    return totals;
  }
}

/** Subject from the strongest item: arrivals › asked-about count › plans. */
export function nudgeSubject(city: string, arrivals: number, askCount: number | null): string {
  if (arrivals > 0) return arrivals === 1 ? `An alum just moved to ${city}` : `${arrivals} alumni just moved to ${city}`;
  if (askCount !== null) return `${askCount} moving-help searches for ${city}`;
  return `New plans from ${city} alumni`;
}

function firstLine(text: string): string {
  const line = text.trim().split(/\n/)[0]!.trim();
  return line.length > 90 ? `${line.slice(0, 89)}…` : line;
}
