import type { Pool, PoolClient } from "pg";
import { env } from "../config/env.js";
import { normalizePlaceAlias } from "../lib/canonicalPlacesNormalize.js";
import { countryMatchKeys, normalizeCountry } from "../lib/countries.js";
import { AppError } from "../lib/errors.js";
import { maskEmail } from "../repos/organizationRepo.js";
import { PlaceReviewRepo, type HistoryRow, type ReviewPlaceRow } from "../repos/placeReviewRepo.js";

/** A member may create this many new cities in CITY_SUBMISSION_WINDOW_DAYS. */
export const CITY_SUBMISSIONS_MAX = 5;
export const CITY_SUBMISSION_WINDOW_DAYS = 30;
export const CITY_LABEL_MAX = 120;
export const REJECT_REASON_MIN = 3;
export const REJECT_REASON_MAX = 500;
export const QUEUE_LIMIT = 200;
export const HISTORY_LIMIT = 50;

export function cityReviewEnabled(): boolean {
  return Boolean(env.CITY_REVIEW_ENABLED);
}

/** Spaces tidied; control characters out. */
export function tidyCityLabel(raw: string): string {
  return raw.replace(/[\u0000-\u001F\u007F]/g, " ").trim().replace(/\s+/g, " ");
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

export type ResidenceResolution =
  | { kind: "linked"; place: ReviewPlaceRow; created: boolean }
  | { kind: "unlinked"; reason: "no_city" | "no_country" | "rejected" | "not_found" | "cap" };

export type HistoryView = {
  id: string;
  placeId: string;
  city: string;
  country: string;
  action: HistoryRow["action"];
  actorName: string | null;
  targetPlaceId: string | null;
  targetCity: string | null;
  reason: string | null;
  detail: Record<string, unknown>;
  summary: string;
  at: string;
};

export function historySummary(h: Pick<HistoryRow, "action" | "place_city" | "target_city" | "reason" | "detail">): string {
  const base = historyBase(h);
  const linked = Number((h.detail ?? {}).linkedMembers ?? 0);
  return linked > 0 ? `${base} Linked ${linked} ${linked === 1 ? "member" : "members"}.` : base;
}

function historyBase(h: Pick<HistoryRow, "action" | "place_city" | "target_city" | "reason" | "detail">): string {
  const d = h.detail ?? {};
  switch (h.action) {
    case "submitted":
      if (d.source === "admin") return `Created «${h.place_city}».`;
      return d.auto === true
        ? `«${h.place_city}» was added when a member typed it.`
        : `«${h.place_city}» was typed by a member and is waiting for review.`;
    case "approved":
      return d.previousLabel && d.previousLabel !== h.place_city
        ? `Approved «${h.place_city}» (typed as «${String(d.previousLabel)}»).`
        : `Approved «${h.place_city}».`;
    case "rejected":
      return `Rejected «${h.place_city}»: ${h.reason ?? ""}`.trim();
    case "reopened":
      return `Reopened «${h.place_city}» for review.`;
    case "combined":
      return `Combined «${h.place_city}» into «${h.target_city ?? "another city"}».`;
    case "renamed":
      return `Renamed «${String(d.previousLabel ?? "")}» to «${String(d.nextLabel ?? h.place_city)}».`;
    case "alias_added": {
      const list = Array.isArray(d.aliases) ? (d.aliases as string[]) : [];
      if (list.length === 0) {
        return d.typedCity ? `Linked members who typed «${String(d.typedCity)}» to «${h.place_city}».` : `Updated spellings for «${h.place_city}».`;
      }
      return `Added spelling${list.length === 1 ? "" : "s"} ${list.map((a) => `«${a}»`).join(", ")} for «${h.place_city}».`;
    }
    case "alias_removed":
      return `Removed a spelling for «${h.place_city}».`;
    default:
      return h.action;
  }
}

function toHistoryView(h: HistoryRow): HistoryView {
  return {
    id: h.id,
    placeId: h.place_id,
    city: h.place_city,
    country: h.place_country,
    action: h.action,
    actorName: h.actor_name,
    targetPlaceId: h.target_place_id,
    targetCity: h.target_city,
    reason: h.reason,
    detail: h.detail ?? {},
    summary: historySummary(h),
    at: h.created_at.toISOString()
  };
}

/**
 * City creation and review: an unknown typed city becomes an approved city right away (when creation
 * is on), the admin queue handles any pending rows, and combining/history stay permanent. Every change
 * and its history row are written in one transaction.
 */
export class PlaceReviewService {
  private readonly reader: PlaceReviewRepo;

  constructor(
    private readonly pool: Pool,
    private readonly invalidateCaches: () => void = () => undefined
  ) {
    this.reader = new PlaceReviewRepo(pool);
  }

  private async tx<T>(work: (repo: PlaceReviewRepo, client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const out = await work(new PlaceReviewRepo(client), client);
      await client.query("COMMIT");
      return out;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Members typing a city                                               */
  /* ------------------------------------------------------------------ */

  /**
   * The city a member typed, inside the country they picked (no other country). Approved and pending
   * cities link; a rejected one never links or reopens; nothing found creates an approved city right
   * away (when city creation is on and the member is under the cap), so the page exists immediately.
   * Admin location cleanup is the fallback for junk or mistyped cities.
   */
  async resolveResidence(personId: string, cityRaw: string | null, countryRaw: string | null): Promise<ResidenceResolution> {
    const city = tidyCityLabel(cityRaw ?? "");
    if (!city) return { kind: "unlinked", reason: "no_city" };
    const keys = countryMatchKeys(countryRaw);
    if (keys.length === 0) return { kind: "unlinked", reason: "no_country" };

    const found = await this.reader.findInCountry(city, keys);
    if (found) return this.linkRule(found);
    if (!cityReviewEnabled()) return { kind: "unlinked", reason: "not_found" };
    if ((await this.reader.countSubmittedSince(personId, CITY_SUBMISSION_WINDOW_DAYS)) >= CITY_SUBMISSIONS_MAX) {
      return { kind: "unlinked", reason: "cap" };
    }

    const country = normalizeCountry(countryRaw);
    return this.tx(async (repo) => {
      const inserted = await repo.insertApproved(city.slice(0, CITY_LABEL_MAX), country, personId);
      if (inserted) {
        await repo.addAlias(inserted.id, inserted.city);
        await repo.insertHistory({
          placeId: inserted.id,
          action: "submitted",
          actorPersonId: personId,
          detail: { source: "member", auto: true, typedCity: cityRaw?.trim() ?? city, typedCountry: countryRaw?.trim() ?? country }
        });
        await repo.insertHistory({
          placeId: inserted.id,
          action: "approved",
          actorPersonId: personId,
          detail: { source: "member_auto" }
        });
        // Members who typed the same name while creation was off join the new city now.
        await this.autoLink(repo, inserted.id);
        return { kind: "linked", place: inserted, created: true } as const;
      }
      // Someone else created it a moment ago (or it exists under this exact spelling): same rules.
      const existing = await repo.byExactKey(city, country);
      return existing ? this.linkRule(existing, repo) : ({ kind: "unlinked", reason: "not_found" } as const);
    });
  }

  /**
   * Auto-link for an approved city: unlinked members whose typed city is its label or any spelling, inside
   * the same country (the country-key rules members use). Never moves anyone already linked; never runs
   * for pending, rejected or combined cities. Runs inside the caller's transaction.
   */
  private async autoLink(repo: PlaceReviewRepo, placeId: string): Promise<number> {
    const place = await repo.byId(placeId);
    if (!place || place.status !== "approved") return 0;
    const names = [place.city, ...(await repo.aliases(placeId))];
    return repo.linkMatching(placeId, names, countryMatchKeys(place.country));
  }

  /** Whether this place is an approved city (full city page eligibility). */
  async approvedById(placeId: string): Promise<boolean> {
    const place = await this.reader.byId(placeId);
    return place?.status === "approved";
  }

  /** An approved city by name or spelling inside one country (Cities v1 lookup). */
  async approvedCity(cityRaw: string, countryRaw: string): Promise<ReviewPlaceRow | null> {
    const keys = countryMatchKeys(countryRaw);
    const city = tidyCityLabel(cityRaw);
    if (!city || keys.length === 0) return null;
    const found = await this.reader.findInCountry(city, keys);
    if (!found) return null;
    const final = found.status === "combined" ? await this.reader.final(found) : found;
    return final && final.status === "approved" ? final : null;
  }

  private async linkRule(place: ReviewPlaceRow, repo: PlaceReviewRepo = this.reader): Promise<ResidenceResolution> {
    const final = place.status === "combined" ? await repo.final(place) : place;
    if (!final) return { kind: "unlinked", reason: "not_found" };
    if (final.status === "rejected") return { kind: "unlinked", reason: "rejected" };
    return { kind: "linked", place: final, created: false };
  }

  /* ------------------------------------------------------------------ */
  /* Review queue                                                        */
  /* ------------------------------------------------------------------ */

  private assertEnabled(): void {
    if (!cityReviewEnabled()) throw new AppError(404, "NOT_FOUND", "Not found.");
  }

  async queue(status: "pending" | "rejected", search: string) {
    this.assertEnabled();
    const rows = await this.reader.queue(status, search, QUEUE_LIMIT);
    return rows.map((r) => ({
      id: r.id,
      city: r.city,
      country: r.country,
      status: r.status,
      linkedMembers: r.linked_members,
      submittedByEmailMasked: maskEmail(r.submitted_by_email),
      submittedAt: (r.submitted_at ?? null)?.toISOString() ?? null,
      aliases: r.aliases.filter((a) => a !== normalizePlaceAlias(r.city)),
      rejectionReason: r.rejection_reason,
      reviewedAt: r.reviewed_at?.toISOString() ?? null
    }));
  }

  async searchApproved(search: string, excludeId: string | null) {
    this.assertEnabled();
    return this.reader.searchApproved(search, excludeId, 20);
  }

  async approve(actorId: string, placeId: string, renameTo: string | null) {
    this.assertEnabled();
    const label = renameTo === null ? null : tidyCityLabel(renameTo);
    if (label !== null && (label.length < 2 || label.length > CITY_LABEL_MAX)) {
      throw new AppError(400, "CITY_REVIEW_BAD_REQUEST", `City names are 2 to ${CITY_LABEL_MAX} characters.`);
    }
    try {
      const out = await this.tx(async (repo) => {
        const place = (await repo.lock([placeId])).get(placeId);
        if (!place) throw new AppError(404, "CITY_NOT_FOUND", "City not found.");
        if (place.status !== "pending") throw new AppError(409, "CITY_NOT_PENDING", "This city isn't waiting for review any more.");
        const renamed = label !== null && label !== place.city;
        const next = await repo.setStatus(placeId, { status: "approved", reviewerId: actorId, cityLabel: renamed ? label : undefined });
        if (renamed) {
          // The typed spelling keeps working as an alias; the history keeps both names.
          const added = await repo.addAlias(placeId, label!);
          await repo.insertHistory({
            placeId,
            action: "renamed",
            actorPersonId: actorId,
            detail: { previousLabel: place.city, nextLabel: label, via: "approve" }
          });
          if (added) await repo.insertHistory({ placeId, action: "alias_added", actorPersonId: actorId, detail: { aliases: [normalizePlaceAlias(label!)] } });
        }
        const linkedMembers = await this.autoLink(repo, placeId);
        await repo.insertHistory({
          placeId,
          action: "approved",
          actorPersonId: actorId,
          detail: { ...(renamed ? { previousLabel: place.city } : {}), linkedMembers }
        });
        return { next, linkedMembers };
      });
      this.invalidateCaches();
      return { id: out.next.id, city: out.next.city, country: out.next.country, status: out.next.status, linkedMembers: out.linkedMembers };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, "CITY_NAME_TAKEN", "A city with that name already exists in this country. Use “Same city as…” instead.");
      }
      throw error;
    }
  }

  async reject(actorId: string, placeId: string, reasonRaw: string) {
    this.assertEnabled();
    const reason = reasonRaw.trim().replace(/\s+/g, " ");
    if (reason.length < REJECT_REASON_MIN || reason.length > REJECT_REASON_MAX) {
      throw new AppError(400, "CITY_REJECT_REASON_REQUIRED", `Give a reason (${REJECT_REASON_MIN} to ${REJECT_REASON_MAX} characters).`);
    }
    await this.tx(async (repo) => {
      const place = (await repo.lock([placeId])).get(placeId);
      if (!place) throw new AppError(404, "CITY_NOT_FOUND", "City not found.");
      // Pending queue reject, and "hide" for an approved city that should not exist (junk): same
      // mechanics - members stay linked, the city leaves every approved-only surface, reopen restores.
      if (place.status !== "pending" && place.status !== "approved") {
        throw new AppError(409, "CITY_NOT_PENDING", "This city isn't waiting for review any more.");
      }
      await repo.setStatus(placeId, { status: "rejected", reviewerId: actorId, reason });
      await repo.insertHistory({ placeId, action: "rejected", actorPersonId: actorId, reason, detail: { previousStatus: place.status } });
    });
    this.invalidateCaches();
  }

  async reopen(actorId: string, placeId: string) {
    this.assertEnabled();
    await this.tx(async (repo) => {
      const place = (await repo.lock([placeId])).get(placeId);
      if (!place) throw new AppError(404, "CITY_NOT_FOUND", "City not found.");
      if (place.status !== "rejected") throw new AppError(409, "CITY_NOT_REJECTED", "Only a rejected city can be reopened.");
      await repo.setStatus(placeId, { status: "pending", reviewerId: actorId });
      await repo.insertHistory({ placeId, action: "reopened", actorPersonId: actorId, detail: { previousReason: place.rejection_reason } });
    });
    this.invalidateCaches();
  }

  /** "Same city as…" from the queue: a pending or rejected city becomes a redirect to an approved one. */
  async sameAs(actorId: string, placeId: string, targetId: string) {
    this.assertEnabled();
    const place = await this.reader.byId(placeId);
    if (!place) throw new AppError(404, "CITY_NOT_FOUND", "City not found.");
    if (place.status !== "pending" && place.status !== "rejected") {
      throw new AppError(409, "CITY_NOT_PENDING", "This city isn't waiting for review any more.");
    }
    return this.combine(actorId, targetId, placeId, { from: ["pending", "rejected"] });
  }

  /* ------------------------------------------------------------------ */
  /* Safe combining (queue, Location cleanup and the admin merge)        */
  /* ------------------------------------------------------------------ */

  /**
   * Combine `otherId` into `keepId`: everything that points at `otherId` moves to `keepId`, its
   * spellings are copied (its label becomes one), and it stays as a redirect. Nothing is deleted and
   * members' typed text is left as they wrote it.
   */
  async combine(
    actorId: string | null,
    keepId: string,
    otherId: string,
    opts: { from?: ReadonlyArray<ReviewPlaceRow["status"]> } = {}
  ): Promise<{
    keep: { id: string; city: string };
    combined: { id: string; city: string };
    moved: Record<string, number>;
    linkedMembers: number;
  }> {
    if (keepId === otherId) throw new AppError(400, "CITY_INVALID_TARGET", "Pick two different cities.");
    const out = await this.tx(async (repo) => {
      const rows = await repo.lock([keepId, otherId]);
      const keep = rows.get(keepId);
      const other = rows.get(otherId);
      if (!keep || !other) throw new AppError(404, "CITY_NOT_FOUND", "One or both cities were not found.");
      if (keep.status !== "approved") {
        throw new AppError(400, "CITY_INVALID_TARGET", "Combine into an approved city.");
      }
      if (other.status === "combined") throw new AppError(409, "CITY_ALREADY_COMBINED", "That city was already combined into another.");
      if (opts.from && !opts.from.includes(other.status)) {
        throw new AppError(409, "CITY_NOT_PENDING", "This city isn't waiting for review any more.");
      }

      const moved = await repo.moveReferences(otherId, keepId);
      const newAliases = await repo.copyAliases(otherId, keepId);
      if (await repo.addAlias(keepId, other.city)) newAliases.push(normalizePlaceAlias(other.city));
      const repointed = await repo.markCombined(otherId, keepId, actorId);
      // The kept city now has the other city's spellings: members who typed one of them get linked too.
      const linkedMembers = await this.autoLink(repo, keepId);

      await repo.insertHistory({
        placeId: otherId,
        action: "combined",
        actorPersonId: actorId,
        targetPlaceId: keepId,
        detail: { fromLabel: other.city, toLabel: keep.city, previousStatus: other.status, moved, repointedRedirects: repointed, linkedMembers }
      });
      const uniqueAliases = [...new Set(newAliases)];
      if (uniqueAliases.length > 0) {
        await repo.insertHistory({
          placeId: keepId,
          action: "alias_added",
          actorPersonId: actorId,
          detail: { aliases: uniqueAliases, via: "combine", fromPlaceId: otherId }
        });
      }
      return { keep: { id: keep.id, city: keep.city }, combined: { id: other.id, city: other.city }, moved, linkedMembers };
    });
    this.invalidateCaches();
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Admin edits that also write history (Location cleanup, admin places) */
  /* ------------------------------------------------------------------ */

  private async createApprovedIn(
    repo: PlaceReviewRepo,
    actorId: string | null,
    countryRaw: string,
    cityRaw: string,
    extraSpellings: string[] = []
  ): Promise<{ place: ReviewPlaceRow; linkedMembers: number }> {
    const country = normalizeCountry(countryRaw);
    const city = tidyCityLabel(cityRaw);
    if (!country || !city) throw new AppError(400, "CITY_REVIEW_BAD_REQUEST", "Country and city are required.");
    const inserted = await repo.insertApproved(city.slice(0, CITY_LABEL_MAX), country, actorId);
    if (!inserted) {
      const existing = await repo.byExactKey(city, country);
      if (existing && existing.status !== "approved") {
        throw new AppError(409, "CITY_EXISTS_IN_REVIEW", `«${existing.city}» already exists and is ${existing.status}. Review it in City review.`);
      }
      throw new AppError(409, "CANONICAL_PLACE_EXISTS", "A city with this country and name already exists.");
    }
    await repo.addAlias(inserted.id, inserted.city);
    const spellings: string[] = [];
    for (const raw of extraSpellings) {
      if (await repo.addAlias(inserted.id, raw)) spellings.push(normalizePlaceAlias(raw));
    }
    await repo.insertHistory({ placeId: inserted.id, action: "submitted", actorPersonId: actorId, detail: { source: "admin" } });
    if (spellings.length > 0) {
      await repo.insertHistory({ placeId: inserted.id, action: "alias_added", actorPersonId: actorId, detail: { aliases: spellings, via: "create" } });
    }
    const linkedMembers = await this.autoLink(repo, inserted.id);
    await repo.insertHistory({ placeId: inserted.id, action: "approved", actorPersonId: actorId, detail: { source: "admin", linkedMembers } });
    return { place: inserted, linkedMembers };
  }

  async createApproved(
    actorId: string | null,
    countryRaw: string,
    cityRaw: string,
    extraSpellings: string[] = []
  ): Promise<{ place: ReviewPlaceRow; linkedMembers: number }> {
    const out = await this.tx((repo) => this.createApprovedIn(repo, actorId, countryRaw, cityRaw, extraSpellings));
    this.invalidateCaches();
    return out;
  }

  /**
   * Create an approved city from typed text and link the members who typed it (one transaction). The admin
   * may give the city a proper name (`label`, e.g. "bangalore" -> "Bengaluru") and extra spellings; the
   * typed text is always kept as a spelling.
   */
  async createFromTypedText(
    actorId: string,
    countryRaw: string,
    cityRaw: string,
    norm: { normCountry: string; normCity: string },
    opts: { label?: string | null; extraSpellings?: string[] } = {}
  ) {
    const label = opts.label?.trim() ? opts.label : cityRaw;
    const spellings = [cityRaw, ...(opts.extraSpellings ?? [])];
    const out = await this.tx(async (repo) => {
      const { place, linkedMembers } = await this.createApprovedIn(repo, actorId, countryRaw, label, spellings);
      // The typed cluster itself, even if its country is spelled in a way the country rules don't know.
      const extra = await repo.linkUnmapped(norm.normCountry, norm.normCity, place.id);
      if (extra > 0) {
        await repo.insertHistory({
          placeId: place.id,
          action: "alias_added",
          actorPersonId: actorId,
          detail: { aliases: [], via: "typed_text", typedCity: cityRaw.trim(), linkedMembers: extra }
        });
      }
      return { place, linked: linkedMembers + extra };
    });
    this.invalidateCaches();
    return out;
  }

  /** Treat typed text as an existing city: add the spelling and link the members who typed it. */
  async mapTypedText(actorId: string, placeId: string, typedCity: string, norm: { normCountry: string; normCity: string }) {
    const out = await this.tx(async (repo) => {
      const place = (await repo.lock([placeId])).get(placeId);
      if (!place) throw new AppError(404, "PLACE_NOT_FOUND", "That city was not found.");
      if (place.status !== "approved") throw new AppError(400, "CITY_INVALID_TARGET", "Pick an approved city.");
      const added = await repo.addAlias(placeId, typedCity);
      const linked = (await repo.linkUnmapped(norm.normCountry, norm.normCity, placeId)) + (await this.autoLink(repo, placeId));
      await repo.insertHistory({
        placeId,
        action: "alias_added",
        actorPersonId: actorId,
        detail: { aliases: added ? [normalizePlaceAlias(typedCity)] : [], via: "typed_text", typedCity: typedCity.trim(), linkedMembers: linked }
      });
      return { place, linked };
    });
    this.invalidateCaches();
    return out;
  }

  async rename(actorId: string | null, placeId: string, labelRaw: string) {
    const label = tidyCityLabel(labelRaw);
    if (!label) throw new AppError(400, "PLACE_RENAME_BAD_REQUEST", "City name cannot be empty.");
    if (label.length > CITY_LABEL_MAX) throw new AppError(400, "PLACE_RENAME_BAD_REQUEST", "City name is too long.");
    try {
      const out = await this.tx(async (repo) => {
        const place = (await repo.lock([placeId])).get(placeId);
        if (!place) throw new AppError(404, "PLACE_NOT_FOUND", "Canonical place was not found.");
        if (place.status === "combined") throw new AppError(409, "CITY_ALREADY_COMBINED", "That city was combined into another.");
        if (label === place.city) return { ...place, linkedMembers: 0 };
        await repo.rename(placeId, label);
        await repo.insertHistory({ placeId, action: "renamed", actorPersonId: actorId, detail: { previousLabel: place.city, nextLabel: label } });
        // Both names keep matching what members type.
        const added = [place.city, label].filter(Boolean);
        const fresh: string[] = [];
        for (const a of added) if (await repo.addAlias(placeId, a)) fresh.push(normalizePlaceAlias(a));
        const linkedMembers = await this.autoLink(repo, placeId);
        if (fresh.length > 0 || linkedMembers > 0) {
          await repo.insertHistory({ placeId, action: "alias_added", actorPersonId: actorId, detail: { aliases: fresh, via: "rename", linkedMembers } });
        }
        return { ...place, city: label, linkedMembers };
      });
      this.invalidateCaches();
      return out;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, "CITY_NAME_TAKEN", "A city with that name already exists in this country.");
      }
      throw error;
    }
  }

  async addAlias(actorId: string | null, placeId: string, aliasRaw: string): Promise<{ added: boolean; linkedMembers: number }> {
    const alias = normalizePlaceAlias(aliasRaw);
    if (!alias) throw new AppError(400, "PLACE_ALIAS_BAD_REQUEST", "Alias cannot be empty.");
    const out = await this.tx(async (repo) => {
      const place = (await repo.lock([placeId])).get(placeId);
      if (!place) throw new AppError(404, "PLACE_NOT_FOUND", "That city was not found.");
      const isNew = await repo.addAlias(placeId, aliasRaw);
      if (!isNew) return { added: false, linkedMembers: 0 };
      const linkedMembers = await this.autoLink(repo, placeId);
      await repo.insertHistory({ placeId, action: "alias_added", actorPersonId: actorId, detail: { aliases: [alias], linkedMembers } });
      return { added: true, linkedMembers };
    });
    if (out.added) this.invalidateCaches();
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* History (admin only)                                                */
  /* ------------------------------------------------------------------ */

  /** The queue's history views (same switch as the queue; Location cleanup reads `history` regardless). */
  async reviewHistory(placeId: string | null, limit = HISTORY_LIMIT): Promise<HistoryView[]> {
    this.assertEnabled();
    return this.history(placeId, limit);
  }

  async history(placeId: string | null, limit = HISTORY_LIMIT): Promise<HistoryView[]> {
    return (await this.reader.history(placeId, Math.min(Math.max(limit, 1), 200))).map(toHistoryView);
  }

  async place(placeId: string): Promise<ReviewPlaceRow | null> {
    return this.reader.byId(placeId);
  }

  async isLinked(personId: string, placeId: string): Promise<boolean> {
    return this.reader.isLinked(personId, placeId);
  }

  async final(place: ReviewPlaceRow): Promise<ReviewPlaceRow | null> {
    return this.reader.final(place);
  }
}
