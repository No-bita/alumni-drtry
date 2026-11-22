import type { Pool } from "pg";
import { AppError } from "../lib/errors.js";
import { PERSON_AREA_MAX_LENGTH, PERSON_AREAS_MAX, normalizeAreaLabel, normalizePersonAreas } from "../lib/personAreas.js";
import { PersonAreaRepo, type AreaSuggestion } from "../repos/personAreaRepo.js";

/** Suggestions start at two typed characters and return at most this many. */
export const AREA_SUGGESTION_MIN_QUERY = 2;
export const AREA_SUGGESTION_LIMIT = 8;

function isPgUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

export class PersonAreaService {
  private readonly repo: PersonAreaRepo;

  constructor(private readonly pool: Pool) {
    this.repo = new PersonAreaRepo(pool);
  }

  async listMyAreas(personId: string): Promise<string[]> {
    return this.repo.listByPerson(personId);
  }

  /** Save the member's whole list in one step. Returns the list as stored. */
  async replaceMyAreas(personId: string, raw: readonly string[]): Promise<string[]> {
    const normalized = normalizePersonAreas(raw);
    if (!normalized.ok) {
      throw normalized.reason === "too_long"
        ? new AppError(400, "AREA_TOO_LONG", `Keep each area to ${PERSON_AREA_MAX_LENGTH} characters.`)
        : new AppError(400, "AREAS_TOO_MANY", `Add up to ${PERSON_AREAS_MAX} areas.`);
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const repo = new PersonAreaRepo(client);
      if (!(await repo.lockPerson(personId))) {
        throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found.");
      }
      await repo.replaceForPerson(personId, normalized.areas);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      // Two spellings our check saw as different but the database lower-cases to the same key.
      if (isPgUniqueViolation(error)) {
        throw new AppError(400, "AREA_DUPLICATE", "Each area can only be added once.");
      }
      throw error;
    } finally {
      client.release();
    }
    return normalized.areas;
  }

  async suggestAreas(rawQuery: string, viewerIsDemo: boolean): Promise<AreaSuggestion[]> {
    const query = normalizeAreaLabel(rawQuery).slice(0, PERSON_AREA_MAX_LENGTH);
    if (query.length < AREA_SUGGESTION_MIN_QUERY) return [];
    return this.repo.suggest(query, viewerIsDemo, AREA_SUGGESTION_LIMIT);
  }
}
