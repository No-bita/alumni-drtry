import type { Pool } from "pg";
import { AppError } from "../lib/errors.js";
import { fingerprintCanonicalMerge, fingerprintUnmapped } from "../lib/locationCleanupFingerprint.js";
import { CanonicalPlacesRepo } from "../repos/canonicalPlacesRepo.js";
import { LocationCleanupRepo } from "../repos/locationCleanupRepo.js";
import { AdminPlacesService } from "./adminPlacesService.js";
import type { HistoryView } from "./placeReviewService.js";

type Activity = { summary: string; at: string };

/** City history (place_history, from city review on) plus the older Location cleanup log (read-only), newest first. */
function mergeActivity(history: HistoryView[], legacy: Array<{ summary: string; created_at: Date }>, limit: number): Activity[] {
  return [
    ...history.map((h) => ({ summary: h.summary, at: h.at })),
    ...legacy.map((r) => ({ summary: r.summary, at: r.created_at.toISOString() }))
  ]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit);
}

export type CleanupConfidence = "high" | "medium" | "low";

function mergeConfidence(sim: number): CleanupConfidence {
  if (sim >= 0.55) return "high";
  if (sim >= 0.36) return "medium";
  return "low";
}

function unmappedConfidence(sim: number | null | undefined): CleanupConfidence | null {
  if (sim == null || Number.isNaN(sim)) return null;
  if (sim >= 0.45) return "high";
  if (sim >= 0.28) return "medium";
  if (sim >= 0.15) return "low";
  return null;
}

function collapseWsLower(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Prefer Bengaluru over Bangalore when tied; else higher profile count; else longer label. */
function recommendedMergeKeeper(row: {
  canonical_id_a: string;
  canonical_id_b: string;
  city_label_a: string;
  city_label_b: string;
  profiles_a: number;
  profiles_b: number;
  country: string;
}): { keeperId: string; combineId: string; resultingCityLabel: string } {
  const la = row.city_label_a.toLowerCase();
  const lb = row.city_label_b.toLowerCase();
  const indiaDup =
    row.country.trim().toLowerCase() === "india" &&
    new Set([la, lb]).has("bangalore") &&
    new Set([la, lb]).has("bengaluru");

  let keeperIsA: boolean;
  if (indiaDup) {
    keeperIsA = la === "bengaluru";
  } else if (row.profiles_a !== row.profiles_b) {
    keeperIsA = row.profiles_a > row.profiles_b;
  } else {
    keeperIsA = row.city_label_a.length >= row.city_label_b.length;
  }

  const keeperId = keeperIsA ? row.canonical_id_a : row.canonical_id_b;
  const combineId = keeperIsA ? row.canonical_id_b : row.canonical_id_a;
  const resultingCityLabel = keeperIsA ? row.city_label_a : row.city_label_b;
  return { keeperId, combineId, resultingCityLabel };
}

export class LocationCleanupService {
  private readonly placesRepo: CanonicalPlacesRepo;
  private readonly cleanupRepo: LocationCleanupRepo;

  constructor(
    pool: Pool,
    private readonly adminPlaces: AdminPlacesService
  ) {
    this.placesRepo = new CanonicalPlacesRepo(pool);
    this.cleanupRepo = new LocationCleanupRepo(pool);
  }

  normCluster(displayCountry: string, displayCity: string): { normCountry: string; normCity: string } {
    return {
      normCountry: collapseWsLower(displayCountry),
      normCity: collapseWsLower(displayCity)
    };
  }

  async getInbox() {
    const [mergeRows, unmappedRows, auditRows, history] = await Promise.all([
      this.cleanupRepo.listMergeSuggestions(),
      this.cleanupRepo.listUnmappedClusters(),
      this.cleanupRepo.listRecentAudit(25),
      this.adminPlaces.review.history(null, 25)
    ]);

    const suggestedMerges = mergeRows.map((row) => {
      const rec = recommendedMergeKeeper(row);
      return {
        country: row.country,
        cityOneLabel: row.city_label_a,
        cityTwoLabel: row.city_label_b,
        cityOneId: row.canonical_id_a,
        cityTwoId: row.canonical_id_b,
        usersAffected: row.profiles_a + row.profiles_b,
        confidence: mergeConfidence(row.similarity_score),
        similarityScore: row.similarity_score,
        recommendedKeepCityId: rec.keeperId,
        recommendedCombineCityId: rec.combineId,
        resultingCityLabel: rec.resultingCityLabel
      };
    });

    const unmappedClusters = unmappedRows.map((row) => {
      const sim = row.suggestion_similarity;
      const hasSuggestion = Boolean(row.suggested_canonical_id);
      const confidence = hasSuggestion ? unmappedConfidence(sim) : null;
      return {
        displayCity: row.display_city,
        displayCountry: row.display_country,
        normCountry: row.norm_country,
        normCity: row.norm_city,
        profiles: row.profiles,
        lastSeenAt: row.last_seen ? row.last_seen.toISOString() : null,
        suggestedCityLabel: row.suggested_city_label,
        suggestedCountryLabel: row.suggested_country,
        suggestedTreatAsCityId: row.suggested_canonical_id,
        suggestionConfidence: confidence,
        suggestionSimilarity: sim
      };
    });

    const recentActivity = mergeActivity(history, auditRows, 25);

    return { suggestedMerges, unmappedClusters, recentActivity };
  }

  async ignoreMergeSuggestion(actorPersonId: string, cityIdOne: string, cityIdTwo: string): Promise<void> {
    const fp = fingerprintCanonicalMerge(cityIdOne, cityIdTwo);
    await this.cleanupRepo.insertIgnore("canonical_merge", fp, actorPersonId);
  }

  async ignoreUnmappedCluster(actorPersonId: string, displayCountry: string, displayCity: string): Promise<void> {
    const { normCountry, normCity } = this.normCluster(displayCountry, displayCity);
    const fp = fingerprintUnmapped(normCountry, normCity);
    await this.cleanupRepo.insertIgnore("unmapped_raw", fp, actorPersonId);
  }

  /** Safe combine: everything moves to the kept city and the other one stays as a redirect (history written with it). */
  async combineCities(actorPersonId: string, keepCityId: string, combineCityId: string): Promise<void> {
    if (keepCityId === combineCityId) {
      throw new AppError(400, "LOCATION_CLEANUP_BAD_REQUEST", "Pick two different cities to combine.");
    }
    try {
      await this.adminPlaces.review.combine(actorPersonId, keepCityId, combineCityId);
    } catch (error) {
      if (error instanceof AppError && error.code === "CITY_NOT_FOUND") {
        throw new AppError(404, "PLACE_NOT_FOUND", "One or both cities were not found.");
      }
      throw error;
    }
  }

  async mapFreeTextToCity(
    actorPersonId: string,
    displayCountry: string,
    displayCity: string,
    treatAsCityId: string
  ): Promise<{ profilesUpdated: number }> {
    const norm = this.normCluster(displayCountry, displayCity);
    const { linked } = await this.adminPlaces.review.mapTypedText(actorPersonId, treatAsCityId, displayCity, norm);
    return { profilesUpdated: linked };
  }

  async createCityFromFreeText(
    actorPersonId: string,
    displayCountry: string,
    displayCity: string
  ): Promise<{ profilesUpdated: number; cityLabel: string; country: string }> {
    const country = displayCountry.trim();
    const city = displayCity.trim();
    if (!country || !city) {
      throw new AppError(400, "LOCATION_CLEANUP_BAD_REQUEST", "Country and city text are required.");
    }
    const { place, linked } = await this.adminPlaces.review.createFromTypedText(
      actorPersonId,
      country,
      city,
      this.normCluster(displayCountry, displayCity)
    );
    return { profilesUpdated: linked, cityLabel: place.city, country: place.country };
  }

  async getPlaceDetail(placeId: string) {
    const row = await this.placesRepo.findById(placeId);
    if (!row) {
      throw new AppError(404, "PLACE_NOT_FOUND", "That city was not found.");
    }
    const [aliases, linkedProfiles, recentNotes, history, review] = await Promise.all([
      this.placesRepo.listAliasNormalizedForPlace(placeId),
      this.cleanupRepo.countDirectoryEligibleForCanonical(placeId),
      this.cleanupRepo.listAuditForPlace(placeId, 20),
      this.adminPlaces.review.history(placeId, 20),
      this.adminPlaces.review.place(placeId)
    ]);

    return {
      place: {
        id: row.id,
        displayCountry: row.country.trim(),
        displayCity: row.city_label.trim(),
        status: review?.status ?? "approved",
        combinedIntoPlaceId: review?.combined_into_place_id ?? null
      },
      aliases,
      linkedProfiles,
      recentNotes: mergeActivity(history, recentNotes, 20)
    };
  }

  async renameCanonicalCity(actorPersonId: string, placeId: string, newCityLabel: string): Promise<void> {
    if (!newCityLabel.trim()) {
      throw new AppError(400, "LOCATION_CLEANUP_BAD_REQUEST", "City name cannot be empty.");
    }
    await this.adminPlaces.renameCityLabel(placeId, newCityLabel, actorPersonId);
  }

  async addAliasForPlace(actorPersonId: string, placeId: string, aliasRaw: string): Promise<void> {
    await this.adminPlaces.addAlias(placeId, aliasRaw, actorPersonId);
  }

  async combineIntoPlace(actorPersonId: string, keeperPlaceId: string, otherPlaceId: string): Promise<void> {
    await this.combineCities(actorPersonId, keeperPlaceId, otherPlaceId);
  }
}
