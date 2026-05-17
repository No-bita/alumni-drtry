import { DatabaseError, type Pool } from "pg";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { buildMatchReasonKeys, type MatchReasonContext } from "../lib/discoveryMatchReasons.js";
import { normalizeDiscoveryQuery } from "../lib/discoveryQueryNormalize.js";
import {
  DiscoveryRepo,
  mapSearchRow,
  type PublicProfileBaseView,
  type ResidenceCityAggregateRow,
  type SearchProfileView,
  type SearchProfilesResult,
  type SearchRankCursor,
  type SearchProfileRow
} from "../repos/discoveryRepo.js";
import { DiscoveryAnalyticsRepo } from "../repos/discoveryAnalyticsRepo.js";
import type { ProfileLinkView } from "../repos/linkRepo.js";
import type { OccupationView } from "../repos/occupationRepo.js";

export interface SearchInput {
  batch?: number;
  dept?: string;
  company?: string;
  occ?: string;
  q?: string;
  residenceCountry?: string;
  residenceCity?: string;
  requireResidence?: boolean;
  viewerPersonId?: string;
  limit: number;
  cursor?: string;
}

export interface SearchPageInfo {
  hasMore: boolean;
  nextCursor: string | null;
}

export interface SearchNormalizationMeta {
  applied: boolean;
  batchFromQuery?: number;
  deptFromQuery?: string;
  companyFromQuery?: string;
  removedTokens?: string[];
}

export interface SearchOutput {
  results: SearchProfileView[];
  pageInfo: SearchPageInfo;
  wideningSummary?: string | null;
  messageKey?: string | null;
  searchSessionId?: string | null;
  normalization?: SearchNormalizationMeta | null;
}

export type ResidenceCityAggregate = ResidenceCityAggregateRow;

export interface PublicProfileOutput {
  profile: PublicProfileBaseView;
  occupations: OccupationView[];
  links: ProfileLinkView[];
}

const CURSOR_V2 = 2;
const CURSOR_V3 = 3;

/** Server-side cap when filling the residence-cities aggregate cache. */
const RESIDENCE_CITIES_FETCH_CAP = 120;
/** Cache aggregated rows to avoid heavy GROUP BY on every request (prod/staging). */
const RESIDENCE_CITIES_CACHE_MS = 24 * 60 * 60 * 1000;

let residenceCitiesCache: { expiresAt: number; rows: ResidenceCityAggregate[] } | null = null;

/** Invalidate cached residence-city aggregates (e.g. after admin canonical-place edits). */
export function clearResidenceCitiesCache(): void {
  residenceCitiesCache = null;
}

const uuidLikePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Exported for tests — directory search keyset (v3 includes optional batch widening). */
export function encodeSearchCursor(cursor: SearchRankCursor): string {
  const payload: Record<string, unknown> = {
    v: CURSOR_V3,
    t: cursor.tier,
    c: cursor.completeness,
    pca: cursor.profileCompletedAtMs,
    id: cursor.id
  };
  if (cursor.batchWidened === true) {
    payload.bw = 1;
  }
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function isPgQueryCanceled(error: unknown): boolean {
  return error instanceof DatabaseError && error.code === "57014";
}

/** Exported for tests — directory search keyset (v2/v3). */
export function decodeSearchCursor(raw: string): SearchRankCursor {
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as {
      v?: unknown;
      t?: unknown;
      c?: unknown;
      pca?: unknown;
      id?: unknown;
      bw?: unknown;
    };
    if (parsed.v !== CURSOR_V2 && parsed.v !== CURSOR_V3) {
      throw new Error("invalid cursor version");
    }
    if (typeof parsed.t !== "number" || !Number.isInteger(parsed.t) || parsed.t < 0 || parsed.t > 2) {
      throw new Error("invalid tier");
    }
    if (typeof parsed.c !== "number" || !Number.isFinite(parsed.c)) {
      throw new Error("invalid completeness");
    }
    if (typeof parsed.id !== "string" || !uuidLikePattern.test(parsed.id)) {
      throw new Error("invalid id");
    }
    if (parsed.pca !== null && (typeof parsed.pca !== "number" || !Number.isFinite(parsed.pca))) {
      throw new Error("invalid pca");
    }
    const batchWidened = parsed.v === CURSOR_V3 && parsed.bw === 1;
    return {
      tier: parsed.t,
      completeness: Math.trunc(parsed.c),
      profileCompletedAtMs: parsed.pca === null || parsed.pca === undefined ? null : Math.trunc(parsed.pca as number),
      id: parsed.id,
      ...(batchWidened ? { batchWidened: true } : {})
    };
  } catch {
    throw new AppError(400, "SEARCH_BAD_CURSOR", "Invalid cursor.");
  }
}

function toSearchViews(rows: SearchProfileRow[], ctx: MatchReasonContext): SearchProfileView[] {
  return rows.map((row) => ({
    ...mapSearchRow(row),
    matchReasons: buildMatchReasonKeys(row, ctx)
  }));
}

export class DiscoveryService {
  private readonly discoveryRepo: DiscoveryRepo;
  private readonly discoveryAnalyticsRepo: DiscoveryAnalyticsRepo;

  constructor(private readonly pool: Pool) {
    this.discoveryRepo = new DiscoveryRepo(pool);
    this.discoveryAnalyticsRepo = new DiscoveryAnalyticsRepo(pool);
  }

  async search(input: SearchInput): Promise<SearchOutput> {
    let normMeta: SearchNormalizationMeta | null = null;
    let qIn = input.q?.trim() ? input.q.trim() : undefined;
    let batchIn = input.batch;
    let deptIn = input.dept?.trim() || undefined;
    let companyIn =
      input.company !== undefined && input.company.trim().length > 0 ? input.company.trim() : undefined;

    if (env.DISCOVERY_NORMALIZE_QUERY) {
      const n = normalizeDiscoveryQuery({
        q: qIn,
        batch: batchIn,
        dept: deptIn,
        company: companyIn
      });
      qIn = n.q;
      batchIn = n.batch;
      deptIn = n.dept;
      companyIn = n.company;
      normMeta = {
        applied: n.meta.applied,
        ...(n.meta.batchFromQuery !== undefined ? { batchFromQuery: n.meta.batchFromQuery } : {}),
        ...(n.meta.deptFromQuery !== undefined ? { deptFromQuery: n.meta.deptFromQuery } : {}),
        ...(n.meta.companyFromQuery !== undefined ? { companyFromQuery: n.meta.companyFromQuery } : {}),
        removedTokens: n.meta.removedTokens
      };
    }

    const q =
      qIn !== undefined && qIn.length > 0
        ? qIn.length > 120
          ? qIn.slice(0, 120)
          : qIn
        : undefined;

    const occ =
      input.occ !== undefined && input.occ.trim().length > 0 ? input.occ.trim().toLowerCase() : undefined;

    const decodedCursor = input.cursor ? decodeSearchCursor(input.cursor) : undefined;
    let batchWidenedEffective = decodedCursor?.batchWidened === true;

    const baseRepoInput = {
      batch: batchIn,
      dept: deptIn,
      company: companyIn,
      occ,
      q,
      residenceCountry: input.residenceCountry?.trim() || undefined,
      residenceCity: input.residenceCity?.trim() || undefined,
      requireResidence: input.requireResidence === true,
      ...(input.viewerPersonId ? { viewerPersonId: input.viewerPersonId } : {}),
      limit: input.limit,
      cursor: decodedCursor
    };

    const run = (bw: boolean): Promise<SearchProfilesResult> =>
      this.discoveryRepo.searchProfiles({
        ...baseRepoInput,
        batchWidened: bw
      });

    let searchResult: SearchProfilesResult;
    let wideningSummary: string | null = null;
    let messageKey: string | null = null;

    try {
      searchResult = await run(batchWidenedEffective);
      if (
        !input.cursor &&
        batchIn !== undefined &&
        !batchWidenedEffective &&
        searchResult.rows.length === 0
      ) {
        searchResult = await run(true);
        batchWidenedEffective = true;
        messageKey = "batch_widened_plus_minus_one";
        wideningSummary = `No exact matches for batch ${batchIn}. Showing graduating classes ${batchIn - 1}–${batchIn + 1}.`;
      }
    } catch (e) {
      if (isPgQueryCanceled(e)) {
        throw new AppError(
          504,
          "SEARCH_TIMEOUT",
          "Search took too long. Try narrowing your filters or search text."
        );
      }
      throw e;
    }

    const matchCtx: MatchReasonContext = {
      deptFilter: deptIn,
      batchCenter: batchIn,
      batchWidened: batchWidenedEffective,
      companySoft: companyIn,
      occSoft: occ,
      hasKeywordQ: Boolean(q),
      queryText: q
    };

    const results = toSearchViews(searchResult.rows, matchCtx);

    const nextCursor =
      searchResult.hasMore && searchResult.lastCursor
        ? encodeSearchCursor({
            ...searchResult.lastCursor,
            batchWidened: batchWidenedEffective ? true : undefined
          })
        : null;

    const searchSessionId: string | null = null;
    // Discovery search-session analytics disabled — re-enable when needed:
    // if (
    //   env.DISCOVERY_ANALYTICS_ENABLED &&
    //   !input.cursor &&
    //   input.viewerPersonId
    // ) {
    //   const snapshot = {
    //     q: q ?? null,
    //     batch: batchIn ?? null,
    //     dept: deptIn ?? null,
    //     company: companyIn ?? null,
    //     occ: occ ?? null,
    //     residenceCountry: input.residenceCountry?.trim() ?? null,
    //     residenceCity: input.residenceCity?.trim() ?? null,
    //     batchWidened: batchWidenedEffective,
    //     messageKey,
    //     normalization: normMeta
    //   };
    //   try {
    //     searchSessionId = await this.discoveryAnalyticsRepo.insertSearchSession({
    //       viewerPersonId: input.viewerPersonId,
    //       querySnapshot: snapshot,
    //       resultIds: results.map((r) => r.id),
    //       wideningMessageKey: messageKey,
    //       wideningSummary
    //     });
    //   } catch {
    //     searchSessionId = null;
    //   }
    // }

    return {
      results,
      pageInfo: {
        hasMore: searchResult.hasMore,
        nextCursor
      },
      wideningSummary,
      messageKey,
      searchSessionId,
      normalization: normMeta
    };
  }

  async recordDirectoryProfileClick(input: {
    viewerPersonId: string;
    searchSessionId: string;
    profileId: string;
    resultPosition: number;
  }): Promise<void> {
    void input;
    // Discovery profile-click analytics disabled — re-enable when needed:
    // if (!env.DISCOVERY_ANALYTICS_ENABLED) return;
    // await this.discoveryAnalyticsRepo.insertProfileClick({
    //   searchSessionId: input.searchSessionId,
    //   viewerPersonId: input.viewerPersonId,
    //   profileId: input.profileId,
    //   resultPosition: input.resultPosition
    // });
  }

  async listResidenceCityAggregates(limit: number): Promise<ResidenceCityAggregate[]> {
    const lim = Math.min(Math.max(limit, 1), 120);
    const ttlMs = env.NODE_ENV === "test" ? 0 : RESIDENCE_CITIES_CACHE_MS;
    const now = Date.now();
    if (!residenceCitiesCache || now >= residenceCitiesCache.expiresAt) {
      const rows = await this.discoveryRepo.listResidenceCityAggregates(RESIDENCE_CITIES_FETCH_CAP);
      residenceCitiesCache = { expiresAt: now + ttlMs, rows };
    }
    return residenceCitiesCache.rows.slice(0, lim);
  }

  async getPublicProfile(profileId: string, viewerPersonId: string): Promise<PublicProfileOutput> {
    const bundle = await this.discoveryRepo.findPublicProfileBundleById(profileId, viewerPersonId);
    if (!bundle) {
      throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found.");
    }

    const { profile, occupations, links } = bundle;
    return { profile, occupations, links };
  }
}
