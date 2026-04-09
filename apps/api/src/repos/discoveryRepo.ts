import { env } from "../config/env.js";
import type { PoolExecutor } from "../db/types.js";

export interface SearchProfilesInput {
  batch?: number;
  /** When true, match `batch_year` in [batch-1, batch+1] (widening); strict equality otherwise. */
  batchWidened?: boolean;
  dept?: string;
  /** Hard filter: only profiles with an occupation linked to an org whose name contains this substring (case-insensitive, trimmed). */
  company?: string;
  /** Soft signal: boosts score when any occupation has this type code; not a hard filter. */
  occ?: string;
  q?: string;
  /** Substring match (case-insensitive) on trimmed residence_country. */
  residenceCountry?: string;
  /** Substring match (case-insensitive) on trimmed residence_city. */
  residenceCity?: string;
  /** Require both non-empty residence city and country. */
  requireResidence?: boolean;
  /** Omit this person from results (e.g. current viewer). */
  excludePersonId?: string;
  limit: number;
  /** Keyset cursor (rule-based sort). */
  cursor?: SearchRankCursor;
}

/** Decoded search cursor for ranked directory sort (see DiscoveryService encode/decode). */
export interface SearchRankCursor {
  tier: number;
  completeness: number;
  /** Milliseconds since epoch; null means profile_completed_at was null at cursor row. */
  profileCompletedAtMs: number | null;
  id: string;
  /** True when batch filter used ±1 widening (must match on follow-up pages). */
  batchWidened?: boolean;
}

export interface SearchProfileRow {
  id: string;
  full_name: string;
  department_code: string | null;
  department_name: string | null;
  parsed_department_code: string | null;
  parsed_department_name: string | null;
  batch_year: number | null;
  parsed_joining_year: number | null;
  degree_code: string | null;
  degree_name: string | null;
  bio: string | null;
  headline_role_title: string | null;
  headline_organization_name: string | null;
  residence_country: string | null;
  residence_city: string | null;
  sort_name: string;
  rank_tier: number;
  completeness_score: number;
  profile_completed_at: Date | null;
  soft_company_match: number;
  soft_occ_match: number;
}

export interface SearchProfileView {
  id: string;
  fullName: string;
  departmentCode: string | null;
  departmentName: string | null;
  parsedDepartmentCode: string | null;
  parsedDepartmentName: string | null;
  batchYear: number | null;
  parsedJoiningYear: number | null;
  degreeCode: string | null;
  degreeName: string | null;
  bio: string | null;
  headlineRoleTitle: string | null;
  headlineOrganizationName: string | null;
  residenceCountry: string | null;
  residenceCity: string | null;
  /** Machine keys; UI maps to labels. */
  matchReasons: string[];
}

export interface SearchProfilesResult {
  /** Raw ranked rows (includes `rank_tier`, soft-match flags) for match reasons + cursor. */
  rows: SearchProfileRow[];
  hasMore: boolean;
  lastCursor: SearchRankCursor | null;
}

/** One row per distinct (city, country) pair (trimmed, case-insensitive keys) in the directory. */
export interface ResidenceCityAggregateRow {
  city: string;
  country: string;
  count: number;
}

interface PublicProfileBaseRow {
  id: string;
  full_name: string;
  department_code: string | null;
  department_name: string | null;
  parsed_department_code: string | null;
  parsed_department_name: string | null;
  batch_year: number | null;
  parsed_joining_year: number | null;
  degree_code: string | null;
  degree_name: string | null;
  bio: string | null;
  residence_country: string | null;
  residence_city: string | null;
  profile_completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PublicProfileBaseView {
  id: string;
  fullName: string;
  departmentCode: string | null;
  departmentName: string | null;
  parsedDepartmentCode: string | null;
  parsedDepartmentName: string | null;
  batchYear: number | null;
  parsedJoiningYear: number | null;
  degreeCode: string | null;
  degreeName: string | null;
  bio: string | null;
  residenceCountry: string | null;
  residenceCity: string | null;
  profileCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function mapSearchRow(row: SearchProfileRow): SearchProfileView {
  return {
    id: row.id,
    fullName: row.full_name,
    departmentCode: row.department_code,
    departmentName: row.department_name,
    parsedDepartmentCode: row.parsed_department_code,
    parsedDepartmentName: row.parsed_department_name,
    batchYear: row.batch_year,
    parsedJoiningYear: row.parsed_joining_year,
    degreeCode: row.degree_code,
    degreeName: row.degree_name,
    bio: row.bio,
    headlineRoleTitle: row.headline_role_title,
    headlineOrganizationName: row.headline_organization_name,
    residenceCountry: row.residence_country,
    residenceCity: row.residence_city,
    matchReasons: []
  };
}

function mapPublicRow(row: PublicProfileBaseRow): PublicProfileBaseView {
  return {
    id: row.id,
    fullName: row.full_name,
    departmentCode: row.department_code,
    departmentName: row.department_name,
    parsedDepartmentCode: row.parsed_department_code,
    parsedDepartmentName: row.parsed_department_name,
    batchYear: row.batch_year,
    parsedJoiningYear: row.parsed_joining_year,
    degreeCode: row.degree_code,
    degreeName: row.degree_name,
    bio: row.bio,
    residenceCountry: row.residence_country,
    residenceCity: row.residence_city,
    profileCompletedAt: row.profile_completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class DiscoveryRepo {
  constructor(private readonly db: PoolExecutor) {}

  /**
   * (City, country) pairs from profiles, same visibility as directory search
   * (not deleted/suspended, has display name). Requires non-empty city and country.
   * Ordered by alumni count descending.
   */
  async listResidenceCityAggregates(limit: number): Promise<ResidenceCityAggregateRow[]> {
    const lim = Math.min(Math.max(limit, 1), 120);
    const result = await this.db.query<{ city: string; country: string; count: string | number }>(
      `
      SELECT
        min(btrim(p.residence_city)) AS city,
        min(btrim(p.residence_country)) AS country,
        count(*)::int AS count
      FROM people p
      WHERE p.deleted_at IS NULL
        AND p.suspended_at IS NULL
        AND p.full_name IS NOT NULL
        AND p.residence_city IS NOT NULL
        AND btrim(p.residence_city) <> ''
        AND p.residence_country IS NOT NULL
        AND btrim(p.residence_country) <> ''
      GROUP BY lower(btrim(p.residence_city)), lower(btrim(p.residence_country))
      ORDER BY count(*) DESC, min(btrim(p.residence_city)) ASC, min(btrim(p.residence_country)) ASC
      LIMIT $1
      `,
      [lim]
    );
    return result.rows.map((r) => ({
      city: r.city,
      country: r.country,
      count: typeof r.count === "number" ? r.count : parseInt(String(r.count), 10)
    }));
  }

  async searchProfiles(input: SearchProfilesInput): Promise<SearchProfilesResult> {
    const params: unknown[] = [];
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const whereInner: string[] = [
      "p.deleted_at IS NULL",
      "p.suspended_at IS NULL",
      "p.full_name IS NOT NULL"
    ];

    if (input.excludePersonId) {
      const ph = bind(input.excludePersonId);
      whereInner.push(`p.id <> ${ph}`);
    }

    if (input.batch !== undefined) {
      if (input.batchWidened) {
        const lo = bind(input.batch - 1);
        const hi = bind(input.batch + 1);
        whereInner.push(`p.batch_year BETWEEN ${lo} AND ${hi}`);
      } else {
        const ph = bind(input.batch);
        whereInner.push(`p.batch_year = ${ph}`);
      }
    }

    if (input.dept) {
      const ph = bind(input.dept.toLowerCase());
      whereInner.push(`lower(COALESCE(d.code, p.department_code, '')) = ${ph}`);
    }

    let companySoftPh: string | null = null;
    if (input.company?.trim()) {
      companySoftPh = bind(input.company.trim().toLowerCase());
      whereInner.push(`EXISTS (
        SELECT 1
        FROM occupations co
        JOIN organizations org ON org.id = co.organization_id
        WHERE co.person_id = p.id
          AND org.name IS NOT NULL
          AND strpos(lower(btrim(org.name::text)), ${companySoftPh}) > 0
      )`);
    }

    let occSoftPh: string | null = null;
    if (input.occ) {
      occSoftPh = bind(input.occ.toLowerCase());
    }

    if (input.residenceCountry?.trim()) {
      const ph = bind(input.residenceCountry.trim().toLowerCase());
      whereInner.push(`strpos(lower(trim(COALESCE(p.residence_country, ''))), ${ph}) > 0`);
    }

    if (input.residenceCity?.trim()) {
      const ph = bind(input.residenceCity.trim().toLowerCase());
      whereInner.push(`strpos(lower(trim(COALESCE(p.residence_city, ''))), ${ph}) > 0`);
    }

    if (input.requireResidence) {
      whereInner.push("p.residence_city IS NOT NULL");
      whereInner.push("btrim(p.residence_city) <> ''");
      whereInner.push("p.residence_country IS NOT NULL");
      whereInner.push("btrim(p.residence_country) <> ''");
    }

    let qPh: string | null = null;
    if (input.q) {
      qPh = bind(input.q);
      whereInner.push(
        `(
          to_tsvector('simple'::regconfig, COALESCE(p.full_name, '') || ' ' || COALESCE(p.bio, '') || ' ' || COALESCE(p.residence_country, '') || ' ' || COALESCE(p.residence_city, '')) @@ plainto_tsquery('simple', ${qPh})
          OR EXISTS (
            SELECT 1
            FROM occupations so
            WHERE so.person_id = p.id
              AND to_tsvector('simple'::regconfig, COALESCE(so.role_title, '') || ' ' || COALESCE(so.description, '')) @@ plainto_tsquery('simple', ${qPh})
          )
          OR EXISTS (
            SELECT 1
            FROM occupations so
            LEFT JOIN organizations org ON org.id = so.organization_id
            WHERE so.person_id = p.id
              AND to_tsvector('simple'::regconfig, COALESCE(org.name::text, '')) @@ plainto_tsquery('simple', ${qPh})
          )
        )`
      );
    }

    const rankTierSql =
      input.q && qPh
        ? `CASE
          WHEN regexp_replace(lower(trim(COALESCE(p.full_name, ''))), '\\s+', ' ', 'g') = regexp_replace(lower(trim(${qPh})), '\\s+', ' ', 'g')
            AND char_length(regexp_replace(lower(trim(${qPh})), '\\s+', ' ', 'g')) > 0
            THEN 0
          WHEN to_tsvector('simple'::regconfig, COALESCE(occ.role_title, '')) @@ plainto_tsquery('simple', ${qPh})
            THEN 1
          ELSE 2
        END`
        : `2`;

    const occBoostSql = occSoftPh
      ? `(CASE WHEN EXISTS (
          SELECT 1
          FROM occupations fo
          JOIN occupation_types fot ON fot.id = fo.occupation_type_id
          WHERE fo.person_id = p.id
            AND lower(fot.code) = ${occSoftPh}
        ) THEN 40 ELSE 0 END)`
      : `0`;

    const companyFlagSql = companySoftPh ? `1::integer` : `0::integer`;

    const occFlagSql = occSoftPh
      ? `(CASE WHEN EXISTS (
          SELECT 1
          FROM occupations fo
          JOIN occupation_types fot ON fot.id = fo.occupation_type_id
          WHERE fo.person_id = p.id
            AND lower(fot.code) = ${occSoftPh}
        ) THEN 1 ELSE 0 END)::integer`
      : `0::integer`;

    const completenessSql = `(
      CASE
        WHEN occ.role_title IS NOT NULL AND btrim(occ.role_title) <> ''
             AND occ.organization_name IS NOT NULL AND btrim(occ.organization_name::text) <> ''
          THEN 400
        WHEN occ.role_title IS NOT NULL AND btrim(occ.role_title) <> ''
          THEN 250
        ELSE 0
      END
      + CASE
          WHEN length(btrim(COALESCE(p.bio, ''))) > 80 THEN 200
          WHEN length(btrim(COALESCE(p.bio, ''))) > 0 THEN 100
          ELSE 0
        END
      + CASE WHEN p.personal_email IS NOT NULL THEN 25 ELSE 0 END
      + CASE WHEN EXISTS (SELECT 1 FROM profile_links pl WHERE pl.person_id = p.id) THEN 50 ELSE 0 END
      + ${occBoostSql}
    )::integer`;

    let cursorOuterSql = "";
    if (input.cursor) {
      const ct = bind(input.cursor.tier);
      const cc = bind(input.cursor.completeness);
      const cid = bind(input.cursor.id);
      if (input.cursor.profileCompletedAtMs === null) {
        cursorOuterSql = `
      AND (
        ranked.rank_tier > ${ct}
        OR (ranked.rank_tier = ${ct} AND ranked.completeness_score < ${cc})
        OR (ranked.rank_tier = ${ct} AND ranked.completeness_score = ${cc} AND ranked.profile_completed_at IS NULL AND ranked.id > ${cid}::uuid)
      )`;
      } else {
        const cpca = bind(new Date(input.cursor.profileCompletedAtMs));
        cursorOuterSql = `
      AND (
        ranked.rank_tier > ${ct}
        OR (ranked.rank_tier = ${ct} AND ranked.completeness_score < ${cc})
        OR (ranked.rank_tier = ${ct} AND ranked.completeness_score = ${cc} AND (
          (ranked.profile_completed_at IS NOT NULL AND ranked.profile_completed_at < ${cpca}::timestamptz)
          OR (ranked.profile_completed_at IS NOT NULL AND ranked.profile_completed_at = ${cpca}::timestamptz AND ranked.id > ${cid}::uuid)
          OR (ranked.profile_completed_at IS NULL)
        ))
      )`;
      }
    }

    const limitPlusOne = input.limit + 1;
    const limitPh = bind(limitPlusOne);

    const query = `
      SELECT
        ranked.id,
        ranked.full_name,
        ranked.department_code,
        ranked.department_name,
        ranked.parsed_department_code,
        ranked.parsed_department_name,
        ranked.batch_year,
        ranked.parsed_joining_year,
        ranked.degree_code,
        ranked.degree_name,
        ranked.bio,
        ranked.headline_role_title,
        ranked.headline_organization_name,
        ranked.residence_country,
        ranked.residence_city,
        ranked.sort_name,
        ranked.rank_tier,
        ranked.completeness_score,
        ranked.profile_completed_at,
        ranked.soft_company_match,
        ranked.soft_occ_match
      FROM (
        SELECT
          p.id,
          p.full_name,
          d.code AS department_code,
          d.name AS department_name,
          p.department_code AS parsed_department_code,
          p.department_name AS parsed_department_name,
          p.batch_year,
          p.joining_year AS parsed_joining_year,
          g.code AS degree_code,
          g.name AS degree_name,
          p.bio,
          occ.role_title AS headline_role_title,
          occ.organization_name AS headline_organization_name,
          p.residence_country,
          p.residence_city,
          lower(COALESCE(p.full_name, '')) COLLATE "C" AS sort_name,
          (${rankTierSql})::integer AS rank_tier,
          ${completenessSql} AS completeness_score,
          p.profile_completed_at,
          ${companyFlagSql} AS soft_company_match,
          ${occFlagSql} AS soft_occ_match
        FROM people p
        LEFT JOIN departments d ON d.id = p.department_id
        LEFT JOIN degrees g ON g.id = p.degree_id
        LEFT JOIN LATERAL (
          SELECT
            o.role_title,
            org.name::TEXT AS organization_name
          FROM occupations o
          LEFT JOIN organizations org ON org.id = o.organization_id
          WHERE o.person_id = p.id
          ORDER BY o.is_current DESC, o.start_date DESC NULLS LAST, o.created_at DESC
          LIMIT 1
        ) occ ON TRUE
        WHERE ${whereInner.join("\n  AND ")}
      ) ranked
      WHERE TRUE
      ${cursorOuterSql}
      ORDER BY ranked.rank_tier ASC, ranked.completeness_score DESC, ranked.profile_completed_at DESC NULLS LAST, ranked.id ASC
      LIMIT ${limitPh}
    `;

    const result = await this.runSearchQuery<SearchProfileRow>(query, params);
    const rows = result.rows;
    const hasMore = rows.length > input.limit;
    const finalRows = hasMore ? rows.slice(0, input.limit) : rows;

    const last = finalRows[finalRows.length - 1];
    const lastCursor: SearchRankCursor | null =
      last !== undefined
        ? {
            tier: last.rank_tier,
            completeness: last.completeness_score,
            profileCompletedAtMs: last.profile_completed_at
              ? last.profile_completed_at.getTime()
              : null,
            id: last.id
          }
        : null;

    return {
      rows: finalRows,
      hasMore,
      lastCursor
    };
  }

  async findPublicProfileBaseById(profileId: string): Promise<PublicProfileBaseView | null> {
    const result = await this.db.query<PublicProfileBaseRow>(
      `
      SELECT
        p.id,
        p.full_name,
        d.code AS department_code,
        d.name AS department_name,
        p.department_code AS parsed_department_code,
        p.department_name AS parsed_department_name,
        p.batch_year,
        p.joining_year AS parsed_joining_year,
        g.code AS degree_code,
        g.name AS degree_name,
        p.bio,
        p.residence_country,
        p.residence_city,
        p.profile_completed_at,
        p.created_at,
        p.updated_at
      FROM people p
      LEFT JOIN departments d ON d.id = p.department_id
      LEFT JOIN degrees g ON g.id = p.degree_id
      WHERE p.id = $1
        AND p.deleted_at IS NULL
        AND p.suspended_at IS NULL
        AND p.full_name IS NOT NULL
      LIMIT 1
      `,
      [profileId]
    );
    const row = result.rows[0];
    return row ? mapPublicRow(row) : null;
  }

  /**
   * Runs the search SELECT inside a short transaction so SET LOCAL statement_timeout
   * applies only to this statement and does not leak on pooled connections.
   */
  private async runSearchQuery<T extends SearchProfileRow>(
    text: string,
    params: unknown[]
  ): Promise<{ rows: T[] }> {
    const ms = env.DISCOVERY_SEARCH_STATEMENT_TIMEOUT_MS;
    if (ms === 0) {
      return this.db.query<T>(text, params);
    }

    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL statement_timeout TO ${ms}`);
      const result = await client.query<T>(text, params);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* release will reset broken client if needed */
      }
      throw err;
    } finally {
      client.release();
    }
  }
}
