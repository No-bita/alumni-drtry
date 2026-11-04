import type { Pool } from "pg";
import { AppError } from "../lib/errors.js";
import { CanonicalPlacesRepo } from "../repos/canonicalPlacesRepo.js";
import { PlaceReviewService } from "./placeReviewService.js";

/**
 * Admin place edits. Creating, renaming, spellings and merging go through city review, so every change is
 * recorded in place_history and a merge never deletes a city (the duplicate becomes a redirect).
 */
export class AdminPlacesService {
  private readonly repo: CanonicalPlacesRepo;
  readonly review: PlaceReviewService;

  constructor(
    pool: Pool,
    private readonly invalidateResidenceCaches: () => void
  ) {
    this.repo = new CanonicalPlacesRepo(pool);
    this.review = new PlaceReviewService(pool, invalidateResidenceCaches);
  }

  /** Create an approved city (plus optional spellings); members who typed it are linked in the same step. */
  async createPlace(country: string, cityLabel: string, actorPersonId: string | null = null, spellings: string[] = []) {
    const { place, linkedMembers } = await this.review.createApproved(actorPersonId, country, cityLabel, spellings);
    return { id: place.id, country: place.country, city_label: place.city, linkedMembers };
  }

  /** A spelling for a city; members who typed it are linked when the city is approved. */
  async addAlias(canonicalPlaceId: string, aliasRaw: string, actorPersonId: string | null = null): Promise<{ linkedMembers: number }> {
    const { added, linkedMembers } = await this.review.addAlias(actorPersonId, canonicalPlaceId, aliasRaw);
    if (!added) {
      throw new AppError(409, "PLACE_ALIAS_DUPLICATE", "This alias already exists for this canonical place.");
    }
    return { linkedMembers };
  }

  async renameCityLabel(canonicalPlaceId: string, cityLabel: string, actorPersonId: string | null = null) {
    const row = await this.review.rename(actorPersonId, canonicalPlaceId, cityLabel);
    return { id: row.id, country: row.country, city_label: row.city, linkedMembers: row.linkedMembers };
  }

  /** Safe merge: the loser becomes a redirect to the winner; nothing is deleted. */
  async mergePlaces(winnerId: string, loserId: string, actorPersonId: string | null = null) {
    if (winnerId === loserId) {
      throw new AppError(400, "PLACE_MERGE_BAD_REQUEST", "Cannot merge a place into itself.");
    }
    try {
      return await this.review.combine(actorPersonId, winnerId, loserId);
    } catch (error) {
      if (error instanceof AppError && error.code === "CITY_NOT_FOUND") {
        throw new AppError(404, "PLACE_NOT_FOUND", "One or both canonical places were not found.");
      }
      throw error;
    }
  }

  async remapPeopleResidence(fromCanonicalId: string, toCanonicalId: string): Promise<{ updated: number }> {
    const target = await this.review.place(toCanonicalId);
    if (!target || target.status !== "approved") {
      throw new AppError(400, "CITY_INVALID_TARGET", "Move people to an approved city.");
    }
    // (Argument order fixed: this used to move people from `to` into `from`.)
    const updated = await this.repo.remapPeopleResidenceCanonical(fromCanonicalId, toCanonicalId);
    this.invalidateResidenceCaches();
    return { updated };
  }

  async listPlaces(search: string | undefined, limit: number) {
    return this.repo.listPlaces(search, limit);
  }
}
