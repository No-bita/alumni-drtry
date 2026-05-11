import type { Pool } from "pg";

export interface MergeSuggestionRow {
  canonical_id_a: string;
  canonical_id_b: string;
  country: string;
  city_label_a: string;
  city_label_b: string;
  profiles_a: number;
  profiles_b: number;
  similarity_score: number;
}

export interface UnmappedClusterRow {
  norm_country: string;
  norm_city: string;
  display_city: string;
  display_country: string;
  profiles: number;
  last_seen: Date | null;
  suggested_canonical_id: string | null;
  suggested_city_label: string | null;
  suggested_country: string | null;
  suggestion_similarity: number | null;
}

export class LocationCleanupRepo {
  constructor(private readonly pool: Pool) {}

  async insertAudit(actorPersonId: string, summary: string, detail: Record<string, unknown>): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO location_cleanup_audit (actor_person_id, summary, detail)
      VALUES ($1::uuid, $2, $3::jsonb)
      `,
      [actorPersonId, summary, detail]
    );
  }

  async listRecentAudit(limit: number): Promise<Array<{ summary: string; created_at: Date; detail: unknown }>> {
    const lim = Math.min(Math.max(limit, 1), 100);
    const r = await this.pool.query<{ summary: string; created_at: Date; detail: unknown }>(
      `
      SELECT summary, created_at, detail
      FROM location_cleanup_audit
      ORDER BY created_at DESC
      LIMIT $1::int
      `,
      [lim]
    );
    return r.rows;
  }

  async listAuditForPlace(canonicalPlaceId: string, limit: number): Promise<Array<{ summary: string; created_at: Date }>> {
    const lim = Math.min(Math.max(limit, 1), 50);
    const r = await this.pool.query<{ summary: string; created_at: Date }>(
      `
      SELECT summary, created_at
      FROM location_cleanup_audit
      WHERE detail->>'canonicalPlaceId' = $1
      ORDER BY created_at DESC
      LIMIT $2::int
      `,
      [canonicalPlaceId, lim]
    );
    return r.rows;
  }

  async insertIgnore(scope: "canonical_merge" | "unmapped_raw", fingerprint: string, createdByPersonId: string): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO location_cleanup_suggestion_ignore (scope, fingerprint, created_by_person_id)
      VALUES ($1, $2, $3::uuid)
      ON CONFLICT (scope, fingerprint) DO NOTHING
      `,
      [scope, fingerprint, createdByPersonId]
    );
  }

  async countDirectoryEligibleForCanonical(canonicalPlaceId: string): Promise<number> {
    const r = await this.pool.query<{ c: string }>(
      `
      SELECT COUNT(*)::text AS c
      FROM people p
      WHERE p.residence_canonical_place_id = $1::uuid
        AND p.deleted_at IS NULL
        AND p.suspended_at IS NULL
        AND p.full_name IS NOT NULL
        AND p.profile_completed_at IS NOT NULL
      `,
      [canonicalPlaceId]
    );
    return Number(r.rows[0]?.c ?? 0);
  }

  async remapUnmappedClusterToCanonical(args: {
    normCountry: string;
    normCity: string;
    canonicalPlaceId: string;
    canonicalCityLabel: string;
    canonicalCountry: string;
  }): Promise<number> {
    const result = await this.pool.query(
      `
      UPDATE people p
      SET
        residence_canonical_place_id = $3::uuid,
        residence_city = $4,
        residence_country = $5
      WHERE p.residence_canonical_place_id IS NULL
        AND p.deleted_at IS NULL
        AND p.suspended_at IS NULL
        AND p.full_name IS NOT NULL
        AND p.profile_completed_at IS NOT NULL
        AND lower(trim(regexp_replace(COALESCE(p.residence_country, ''), '\\s+', ' ', 'g'))) = $1
        AND lower(trim(regexp_replace(COALESCE(p.residence_city, ''), '\\s+', ' ', 'g'))) = $2
      `,
      [args.normCountry, args.normCity, args.canonicalPlaceId, args.canonicalCityLabel, args.canonicalCountry]
    );
    return result.rowCount ?? 0;
  }

  async listMergeSuggestions(): Promise<MergeSuggestionRow[]> {
    const result = await this.pool.query<MergeSuggestionRow>(
      `
      WITH elig AS (
        SELECT residence_canonical_place_id AS pid, COUNT(*)::int AS cnt
        FROM people p
        WHERE p.residence_canonical_place_id IS NOT NULL
          AND p.deleted_at IS NULL
          AND p.suspended_at IS NULL
          AND p.full_name IS NOT NULL
          AND p.profile_completed_at IS NOT NULL
        GROUP BY residence_canonical_place_id
      ),
      pairs AS (
        SELECT
          c1.id AS canonical_id_a,
          c2.id AS canonical_id_b,
          trim(c1.country) AS country,
          trim(c1.city_label) AS city_label_a,
          trim(c2.city_label) AS city_label_b,
          COALESCE(e1.cnt, 0)::int AS profiles_a,
          COALESCE(e2.cnt, 0)::int AS profiles_b,
          GREATEST(
            similarity(lower(trim(c1.city_label)), lower(trim(c2.city_label))),
            CASE
              WHEN lower(trim(c1.country)) = 'india'
                AND lower(trim(c1.city_label)) IN ('bangalore', 'bengaluru')
                AND lower(trim(c2.city_label)) IN ('bangalore', 'bengaluru')
              THEN 0.92
              ELSE 0::float
            END
          ) AS similarity_score
        FROM canonical_places c1
        INNER JOIN canonical_places c2
          ON lower(trim(c1.country)) = lower(trim(c2.country))
         AND c1.id < c2.id
        LEFT JOIN elig e1 ON e1.pid = c1.id
        LEFT JOIN elig e2 ON e2.pid = c2.id
        WHERE NOT EXISTS (
          SELECT 1
          FROM location_cleanup_suggestion_ignore ign
          WHERE ign.scope = 'canonical_merge'
            AND ign.fingerprint = (
              'merge:' || LEAST(c1.id::text, c2.id::text) || ':' || GREATEST(c1.id::text, c2.id::text)
            )
        )
        AND (
          similarity(lower(trim(c1.city_label)), lower(trim(c2.city_label))) >= 0.28
          OR (
            lower(trim(c1.country)) = 'india'
            AND lower(trim(c1.city_label)) IN ('bangalore', 'bengaluru')
            AND lower(trim(c2.city_label)) IN ('bangalore', 'bengaluru')
          )
        )
      )
      SELECT *
      FROM pairs
      WHERE profiles_a + profiles_b >= 1
      ORDER BY (profiles_a + profiles_b) DESC, similarity_score DESC
      LIMIT 50
      `
    );
    return result.rows;
  }

  async listUnmappedClusters(): Promise<UnmappedClusterRow[]> {
    const result = await this.pool.query<UnmappedClusterRow>(
      `
      WITH clusters AS (
        SELECT
          lower(trim(regexp_replace(COALESCE(residence_country, ''), '\\s+', ' ', 'g'))) AS norm_country,
          lower(trim(regexp_replace(COALESCE(residence_city, ''), '\\s+', ' ', 'g'))) AS norm_city,
          min(trim(residence_city)) AS display_city,
          min(trim(residence_country)) AS display_country,
          COUNT(*)::int AS profiles,
          MAX(updated_at) AS last_seen
        FROM people p
        WHERE p.residence_canonical_place_id IS NULL
          AND p.deleted_at IS NULL
          AND p.suspended_at IS NULL
          AND p.full_name IS NOT NULL
          AND p.profile_completed_at IS NOT NULL
          AND residence_city IS NOT NULL
          AND trim(residence_city) <> ''
          AND residence_country IS NOT NULL
          AND trim(residence_country) <> ''
        GROUP BY 1, 2
      ),
      scored AS (
        SELECT
          c.norm_country,
          c.norm_city,
          c.display_city,
          c.display_country,
          c.profiles,
          c.last_seen,
          pick.suggested_canonical_id,
          pick.suggested_city_label,
          pick.suggested_country,
          pick.suggestion_similarity
        FROM clusters c
        LEFT JOIN LATERAL (
          SELECT
            cp2.id AS suggested_canonical_id,
            trim(cp2.city_label) AS suggested_city_label,
            trim(cp2.country) AS suggested_country,
            GREATEST(
              similarity(c.norm_city, lower(trim(cp2.city_label))),
              COALESCE(
                (
                  SELECT MAX(similarity(c.norm_city, pa.alias_normalized))
                  FROM place_aliases pa
                  WHERE pa.canonical_place_id = cp2.id
                ),
                0::float
              )
            ) AS suggestion_similarity
          FROM canonical_places cp2
          WHERE lower(trim(cp2.country)) = c.norm_country
             OR similarity(lower(trim(cp2.country)), c.norm_country) > 0.55
          ORDER BY GREATEST(
            similarity(c.norm_city, lower(trim(cp2.city_label))),
            COALESCE(
              (
                SELECT MAX(similarity(c.norm_city, pa.alias_normalized))
                FROM place_aliases pa
                WHERE pa.canonical_place_id = cp2.id
              ),
              0::float
            )
          ) DESC NULLS LAST
          LIMIT 1
        ) pick ON TRUE
        WHERE NOT EXISTS (
          SELECT 1
          FROM location_cleanup_suggestion_ignore ign
          WHERE ign.scope = 'unmapped_raw'
            AND ign.fingerprint = ('raw:' || c.norm_country || ':' || c.norm_city)
        )
      )
      SELECT *
      FROM scored
      WHERE profiles >= 1
      ORDER BY profiles DESC, last_seen DESC NULLS LAST
      LIMIT 80
      `
    );
    return result.rows;
  }
}
