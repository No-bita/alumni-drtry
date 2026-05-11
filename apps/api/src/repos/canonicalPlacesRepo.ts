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

  async listPlaces(search: string | undefined, limit: number): Promise<CanonicalPlaceRow[]> {
    const lim = Math.min(Math.max(limit, 1), 200);
    if (!search?.trim()) {
      const result = await this.pool.query<CanonicalPlaceRow>(
        `
        SELECT id, country, city_label
        FROM canonical_places
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
      WHERE strpos(lower(trim(cp.country)), $1) > 0
         OR strpos(lower(trim(cp.city_label)), $1) > 0
         OR strpos(COALESCE(pa.alias_normalized, ''), $1) > 0
      ORDER BY lower(trim(cp.country)), lower(trim(cp.city_label))
      LIMIT $2::int
      `,
      [needle, lim]
    );
    return result.rows;
  }

  /** Re-point people and aliases from loser → winner; delete loser canonical row. Caller should invalidate discovery caches. */
  async mergePlaces(winnerId: string, loserId: string): Promise<void> {
    if (winnerId === loserId) {
      throw new Error("MERGE_SAME_ID");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const winner = await client.query<{ id: string }>(`SELECT id FROM canonical_places WHERE id = $1`, [winnerId]);
      const loser = await client.query<{ id: string }>(`SELECT id FROM canonical_places WHERE id = $1`, [loserId]);
      if (!winner.rows[0] || !loser.rows[0]) {
        throw new Error("MERGE_UNKNOWN_PLACE");
      }

      await client.query(
        `UPDATE people SET residence_canonical_place_id = $1::uuid WHERE residence_canonical_place_id = $2::uuid`,
        [winnerId, loserId]
      );

      await client.query(
        `
        UPDATE people p
        SET residence_city = w.city_label,
            residence_country = w.country
        FROM canonical_places w
        WHERE w.id = $1::uuid
          AND p.residence_canonical_place_id = w.id
        `,
        [winnerId]
      );

      await client.query(
        `
        INSERT INTO place_aliases (canonical_place_id, alias_normalized)
        SELECT $1::uuid, pa.alias_normalized
        FROM place_aliases pa
        WHERE pa.canonical_place_id = $2::uuid
        ON CONFLICT (canonical_place_id, alias_normalized) DO NOTHING
        `,
        [winnerId, loserId]
      );

      await client.query(`DELETE FROM place_aliases WHERE canonical_place_id = $1::uuid`, [loserId]);
      await client.query(`DELETE FROM canonical_places WHERE id = $1::uuid`, [loserId]);

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async updateCityLabel(canonicalPlaceId: string, cityLabel: string): Promise<CanonicalPlaceRow | null> {
    const city = cityLabel.trim();
    if (!city) {
      throw new Error("EMPTY_CITY_LABEL");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query<CanonicalPlaceRow>(
        `
        UPDATE canonical_places
        SET city_label = $2
        WHERE id = $1::uuid
        RETURNING id, country, city_label
        `,
        [canonicalPlaceId, city]
      );
      const row = updated.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }
      await client.query(
        `
        UPDATE people
        SET residence_city = $2
        WHERE residence_canonical_place_id = $1::uuid
        `,
        [canonicalPlaceId, city]
      );
      await client.query("COMMIT");
      return row;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
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
