import type { Pool } from "pg";
import { AppError } from "../lib/errors.js";
import { fingerprintCanonicalMerge, fingerprintUnmapped } from "../lib/locationCleanupFingerprint.js";
import { CanonicalPlacesRepo } from "../repos/canonicalPlacesRepo.js";
import { LocationCleanupRepo } from "../repos/locationCleanupRepo.js";
import { AdminPlacesService } from "./adminPlacesService.js";

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
    const [mergeRows, unmappedRows, auditRows] = await Promise.all([
      this.cleanupRepo.listMergeSuggestions(),
      this.cleanupRepo.listUnmappedClusters(),
      this.cleanupRepo.listRecentAudit(25)
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

    const recentActivity = auditRows.map((r) => ({
      summary: r.summary,
      at: r.created_at.toISOString()
    }));

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

  async combineCities(actorPersonId: string, keepCityId: string, combineCityId: string): Promise<void> {
    if (keepCityId === combineCityId) {
      throw new AppError(400, "LOCATION_CLEANUP_BAD_REQUEST", "Pick two different cities to combine.");
    }
    const winner = await this.placesRepo.findById(keepCityId);
    const loser = await this.placesRepo.findById(combineCityId);
    if (!winner || !loser) {
      throw new AppError(404, "PLACE_NOT_FOUND", "One or both cities were not found.");
    }
    const moved = await this.cleanupRepo.countDirectoryEligibleForCanonical(combineCityId);

    try {
      await this.adminPlaces.addAlias(keepCityId, loser.city_label);
    } catch (error) {
      if (!(error instanceof AppError && error.code === "PLACE_ALIAS_DUPLICATE")) {
        throw error;
      }
    }

    await this.adminPlaces.mergePlaces(keepCityId, combineCityId);

    await this.cleanupRepo.insertAudit(actorPersonId, `Combined «${loser.city_label}» into «${winner.city_label}». ${moved} profiles updated automatically.`, {
      canonicalPlaceId: keepCityId,
      kind: "combine_cities",
      mergedAwayLabel: loser.city_label,
      keeperLabel: winner.city_label,
      profilesRemapped: moved
    });
  }

  async mapFreeTextToCity(
    actorPersonId: string,
    displayCountry: string,
    displayCity: string,
    treatAsCityId: string
  ): Promise<{ profilesUpdated: number }> {
    const canonical = await this.placesRepo.findById(treatAsCityId);
    if (!canonical) {
      throw new AppError(404, "PLACE_NOT_FOUND", "That city was not found.");
    }
    const { normCountry, normCity } = this.normCluster(displayCountry, displayCity);

    try {
      await this.adminPlaces.addAlias(treatAsCityId, displayCity);
    } catch (error) {
      if (!(error instanceof AppError && error.code === "PLACE_ALIAS_DUPLICATE")) {
        throw error;
      }
    }

    const profilesUpdated = await this.cleanupRepo.remapUnmappedClusterToCanonical({
      normCountry,
      normCity,
      canonicalPlaceId: canonical.id,
      canonicalCityLabel: canonical.city_label,
      canonicalCountry: canonical.country
    });

    await this.cleanupRepo.insertAudit(
      actorPersonId,
      `Treating «${displayCity.trim()}» as «${canonical.city_label}». Added spelling and linked ${profilesUpdated} profiles.`,
      {
        canonicalPlaceId: canonical.id,
        kind: "map_free_text",
        rawCity: displayCity.trim(),
        rawCountry: displayCountry.trim(),
        profilesRemapped: profilesUpdated
      }
    );

    return { profilesUpdated };
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

    const place = await this.adminPlaces.createPlace(country, city);
    const { normCountry, normCity } = this.normCluster(displayCountry, displayCity);

    const profilesUpdated = await this.cleanupRepo.remapUnmappedClusterToCanonical({
      normCountry,
      normCity,
      canonicalPlaceId: place.id,
      canonicalCityLabel: place.city_label,
      canonicalCountry: place.country
    });

    await this.cleanupRepo.insertAudit(actorPersonId, `Created «${place.city_label}, ${place.country}» and linked ${profilesUpdated} profiles.`, {
      canonicalPlaceId: place.id,
      kind: "create_city_from_text",
      profilesRemapped: profilesUpdated
    });

    return { profilesUpdated, cityLabel: place.city_label, country: place.country };
  }

  async getPlaceDetail(placeId: string) {
    const row = await this.placesRepo.findById(placeId);
    if (!row) {
      throw new AppError(404, "PLACE_NOT_FOUND", "That city was not found.");
    }
    const [aliases, linkedProfiles, recentNotes] = await Promise.all([
      this.placesRepo.listAliasNormalizedForPlace(placeId),
      this.cleanupRepo.countDirectoryEligibleForCanonical(placeId),
      this.cleanupRepo.listAuditForPlace(placeId, 20)
    ]);

    return {
      place: {
        id: row.id,
        displayCountry: row.country.trim(),
        displayCity: row.city_label.trim()
      },
      aliases,
      linkedProfiles,
      recentNotes: recentNotes.map((n) => ({
        summary: n.summary,
        at: n.created_at.toISOString()
      }))
    };
  }

  async renameCanonicalCity(actorPersonId: string, placeId: string, newCityLabel: string): Promise<void> {
    const before = await this.placesRepo.findById(placeId);
    if (!before) {
      throw new AppError(404, "PLACE_NOT_FOUND", "That city was not found.");
    }
    const trimmed = newCityLabel.trim();
    if (!trimmed) {
      throw new AppError(400, "LOCATION_CLEANUP_BAD_REQUEST", "City name cannot be empty.");
    }

    await this.adminPlaces.renameCityLabel(placeId, trimmed);

    await this.cleanupRepo.insertAudit(actorPersonId, `Renamed «${before.city_label.trim()}» to «${trimmed}».`, {
      canonicalPlaceId: placeId,
      kind: "rename_city",
      previousLabel: before.city_label.trim(),
      nextLabel: trimmed
    });
  }

  async addAliasForPlace(actorPersonId: string, placeId: string, aliasRaw: string): Promise<void> {
    const row = await this.placesRepo.findById(placeId);
    if (!row) {
      throw new AppError(404, "PLACE_NOT_FOUND", "That city was not found.");
    }
    await this.adminPlaces.addAlias(placeId, aliasRaw);
    await this.cleanupRepo.insertAudit(actorPersonId, `Added spelling «${aliasRaw.trim()}» for «${row.city_label.trim()}».`, {
      canonicalPlaceId: placeId,
      kind: "add_alias",
      alias: aliasRaw.trim()
    });
  }

  async combineIntoPlace(actorPersonId: string, keeperPlaceId: string, otherPlaceId: string): Promise<void> {
    await this.combineCities(actorPersonId, keeperPlaceId, otherPlaceId);
  }
}
