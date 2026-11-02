import type { Pool } from "pg";
import { normalizePlaceAlias } from "../lib/canonicalPlacesNormalize.js";

export interface CanonicalPlaceRow {
  id: string;
  country: string;
  city_label: string;
}

export interface PlaceSuggestionRow {
  id: string;
  country: string;
  city_label: string;
}

export class CanonicalPlacesRepo {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<CanonicalPlaceRow | null> {
    const result = await this.pool.query<CanonicalPlaceRow>(
      `
      SELECT id, country, city_label
      FROM canonical_places
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async createPlace(country: string, cityLabel: string): Promise<CanonicalPlaceRow> {
    const c = country.trim();
    const city = cityLabel.trim();
    const result = await this.pool.query<CanonicalPlaceRow>(
      `
      INSERT INTO canonical_places (country, city_label)
      VALUES ($1, $2)
      RETURNING id, country, city_label
      `,
      [c, city]
    );
    const row = result.rows[0]!;
    const alias = normalizePlaceAlias(city);
    await this.pool.query(
      `
      INSERT INTO place_aliases (canonical_place_id, alias_normalized)
      VALUES ($1::uuid, $2)
      ON CONFLICT (canonical_place_id, alias_normalized) DO NOTHING
      `,
      [row.id, alias]
    );
    return row;
  }

  async addAlias(canonicalPlaceId: string, aliasRaw: string): Promise<void> {
    const alias = normalizePlaceAlias(aliasRaw);
    if (!alias) {
      throw new Error("EMPTY_ALIAS");
    }
    await this.pool.query(
      `
      INSERT INTO place_aliases (canonical_place_id, alias_normalized)
      VALUES ($1::uuid, $2)
      `,
      [canonicalPlaceId, alias]
    );
  }

  /**
   * Ranked suggestions for autocomplete; `q` should be trimmed (may be empty → returns recent-ish alphabetically capped).
   */
  async suggestPlaces(qRaw: string, countryFilterRaw: string | undefined, limit: number): Promise<PlaceSuggestionRow[]> {
    const q = normalizePlaceAlias(qRaw);
    const countryFilter = countryFilterRaw?.trim() ? normalizePlaceAlias(countryFilterRaw) : "";
    const lim = Math.min(Math.max(limit, 1), 40);

    if (!q) {
      const result = await this.pool.query<PlaceSuggestionRow>(
        `
        SELECT id, country, city_label
        FROM canonical_places cp
        WHERE ($1::text = '' OR strpos(lower(trim(cp.country)), $1) > 0)
        ORDER BY lower(trim(cp.country)), lower(trim(cp.city_label))
        LIMIT $2::int
        `,
        [countryFilter, lim]
      );
      return result.rows;
    }

    const result = await this.pool.query<PlaceSuggestionRow>(
      `
      SELECT DISTINCT cp.id, cp.country, cp.city_label
      FROM canonical_places cp
      LEFT JOIN place_aliases pa ON pa.canonical_place_id = cp.id
      WHERE ($2::text = '' OR strpos(lower(trim(cp.country)), $2) > 0)
        AND (
          strpos(lower(trim(cp.city_label)), $1) > 0
          OR strpos(COALESCE(pa.alias_normalized, ''), $1) > 0
          OR similarity(lower(trim(cp.city_label)), $1) > 0.22
          OR similarity(COALESCE(pa.alias_normalized, ''), $1) > 0.22
        )
      ORDER BY
        CASE WHEN lower(trim(cp.city_label)) = $1 THEN 0 ELSE 1 END,
        lower(trim(cp.country)),
        lower(trim(cp.city_label))
      LIMIT $3::int
      `,
      [q, countryFilter, lim]
    );
    return result.rows;
  }

  /** Approved cities only (pending, rejected and combined ones are handled in City review). */
  async listPlaces(search: string | undefined, limit: number): Promise<CanonicalPlaceRow[]> {
    const lim = Math.min(Math.max(limit, 1), 200);
    if (!search?.trim()) {
      const result = await this.pool.query<CanonicalPlaceRow>(
        `
        SELECT id, country, city_label
        FROM canonical_places
        WHERE status = 'approved'
        ORDER BY lower(trim(country)), lower(trim(city_label))
        LIMIT $1::int
        `,
        [lim]
      );
      return result.rows;
    }
    const needle = normalizePlaceAlias(search);
    const result = await this.pool.query<CanonicalPlaceRow>(
      `
      SELECT DISTINCT cp.id, cp.country, cp.city_label
      FROM canonical_places cp
      LEFT JOIN place_aliases pa ON pa.canonical_place_id = cp.id
      WHERE cp.status = 'approved'
        AND (strpos(lower(trim(cp.country)), $1) > 0
         OR strpos(lower(trim(cp.city_label)), $1) > 0
         OR strpos(COALESCE(pa.alias_normalized, ''), $1) > 0)
      ORDER BY lower(trim(cp.country)), lower(trim(cp.city_label))
      LIMIT $2::int
      `,
      [needle, lim]
    );
    return result.rows;
  }

  async listAliasNormalizedForPlace(canonicalPlaceId: string): Promise<string[]> {
    const r = await this.pool.query<{ alias_normalized: string }>(
      `
      SELECT alias_normalized
      FROM place_aliases
      WHERE canonical_place_id = $1::uuid
      ORDER BY alias_normalized
      `,
      [canonicalPlaceId]
    );
    return r.rows.map((x) => x.alias_normalized);
  }

  /** Bulk update people from one canonical id to another (e.g. before merge). Same as merge’s people step if used alone. */
  async remapPeopleResidenceCanonical(fromCanonicalId: string, toCanonicalId: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE people SET residence_canonical_place_id = $1::uuid WHERE residence_canonical_place_id = $2::uuid`,
      [toCanonicalId, fromCanonicalId]
    );
    return result.rowCount ?? 0;
  }
}
