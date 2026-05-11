import type { Pool } from "pg";
import { AppError } from "../lib/errors.js";
import { CanonicalPlacesRepo } from "../repos/canonicalPlacesRepo.js";

function isPgUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export class AdminPlacesService {
  private readonly repo: CanonicalPlacesRepo;

  constructor(
    pool: Pool,
    private readonly invalidateResidenceCaches: () => void
  ) {
    this.repo = new CanonicalPlacesRepo(pool);
  }

  async createPlace(country: string, cityLabel: string) {
    try {
      const row = await this.repo.createPlace(country, cityLabel);
      this.invalidateResidenceCaches();
      return row;
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new AppError(409, "CANONICAL_PLACE_EXISTS", "A canonical place with this country and city already exists.");
      }
      throw error;
    }
  }

  async addAlias(canonicalPlaceId: string, aliasRaw: string) {
    try {
      await this.repo.addAlias(canonicalPlaceId, aliasRaw);
    } catch (error) {
      if (error instanceof Error && error.message === "EMPTY_ALIAS") {
        throw new AppError(400, "PLACE_ALIAS_BAD_REQUEST", "Alias cannot be empty.");
      }
      if (isPgUniqueViolation(error)) {
        throw new AppError(409, "PLACE_ALIAS_DUPLICATE", "This alias already exists for this canonical place.");
      }
      throw error;
    }
    this.invalidateResidenceCaches();
  }

  async renameCityLabel(canonicalPlaceId: string, cityLabel: string) {
    try {
      const row = await this.repo.updateCityLabel(canonicalPlaceId, cityLabel);
      if (!row) {
        throw new AppError(404, "PLACE_NOT_FOUND", "Canonical place was not found.");
      }
      this.invalidateResidenceCaches();
      return row;
    } catch (error) {
      if (error instanceof Error && error.message === "EMPTY_CITY_LABEL") {
        throw new AppError(400, "PLACE_RENAME_BAD_REQUEST", "City label cannot be empty.");
      }
      throw error;
    }
  }

  async mergePlaces(winnerId: string, loserId: string) {
    try {
      await this.repo.mergePlaces(winnerId, loserId);
    } catch (error) {
      if (error instanceof Error && error.message === "MERGE_SAME_ID") {
        throw new AppError(400, "PLACE_MERGE_BAD_REQUEST", "Cannot merge a place into itself.");
      }
      if (error instanceof Error && error.message === "MERGE_UNKNOWN_PLACE") {
        throw new AppError(404, "PLACE_NOT_FOUND", "One or both canonical places were not found.");
      }
      throw error;
    }
    this.invalidateResidenceCaches();
  }

  async remapPeopleResidence(fromCanonicalId: string, toCanonicalId: string): Promise<{ updated: number }> {
    const updated = await this.repo.remapPeopleResidenceCanonical(toCanonicalId, fromCanonicalId);
    this.invalidateResidenceCaches();
    return { updated };
  }

  async listPlaces(search: string | undefined, limit: number) {
    return this.repo.listPlaces(search, limit);
  }
}
