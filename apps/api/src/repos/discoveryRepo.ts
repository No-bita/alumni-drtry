import type { DbExecutor } from "../db/types.js";

export interface SearchProfilesInput {
  batchYear?: number;
  departmentCode?: string;
  organizationId?: string;
  occupationTypeCode?: string;
  keyword?: string;
  limit: number;
  cursor?: {
    name: string;
    id: string;
  };
}

interface SearchProfileRow {
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
  sort_name: string;
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
}

export interface SearchProfilesResult {
  rows: SearchProfileView[];
  hasMore: boolean;
  lastCursor: { name: string; id: string } | null;
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
  skills_text: string | null;
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
  skillsText: string | null;
  profileCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapSearchRow(row: SearchProfileRow): SearchProfileView {
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
    headlineOrganizationName: row.headline_organization_name
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
    skillsText: row.skills_text,
    profileCompletedAt: row.profile_completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class DiscoveryRepo {
  constructor(private readonly db: DbExecutor) {}

  async searchProfiles(input: SearchProfilesInput): Promise<SearchProfilesResult> {
    const params: unknown[] = [];
    const where: string[] = [
      "p.is_searchable = TRUE",
      "p.deleted_at IS NULL",
      "p.suspended_at IS NULL",
      "p.full_name IS NOT NULL"
    ];

    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    if (input.batchYear !== undefined) {
      const ph = bind(input.batchYear);
      where.push(`COALESCE(p.batch_year, p.joining_year) = ${ph}`);
    }

    if (input.departmentCode) {
      const ph = bind(input.departmentCode.toLowerCase());
      where.push(`lower(COALESCE(d.code, p.department_code, '')) = ${ph}`);
    }

    if (input.organizationId) {
      const ph = bind(input.organizationId);
      where.push(
        `EXISTS (
          SELECT 1
          FROM occupations fo
          WHERE fo.person_id = p.id
            AND fo.organization_id = ${ph}
        )`
      );
    }

    if (input.occupationTypeCode) {
      const ph = bind(input.occupationTypeCode.toLowerCase());
      where.push(
        `EXISTS (
          SELECT 1
          FROM occupations fo
          JOIN occupation_types fot ON fot.id = fo.occupation_type_id
          WHERE fo.person_id = p.id
            AND lower(fot.code) = ${ph}
        )`
      );
    }

    if (input.keyword) {
      const ph = bind(input.keyword);
      where.push(
        `(
          to_tsvector('simple'::regconfig, COALESCE(p.full_name, '') || ' ' || COALESCE(p.bio, '') || ' ' || COALESCE(p.skills_text, '')) @@ plainto_tsquery('simple', ${ph})
          OR EXISTS (
            SELECT 1
            FROM occupations so
            WHERE so.person_id = p.id
              AND to_tsvector('simple'::regconfig, COALESCE(so.role_title, '') || ' ' || COALESCE(so.description, '')) @@ plainto_tsquery('simple', ${ph})
          )
        )`
      );
    }

    if (input.cursor) {
      const namePh = bind(input.cursor.name);
      const idPh = bind(input.cursor.id);
      where.push(
        `(
          lower(COALESCE(p.full_name, '')) COLLATE "C" > ${namePh}
          OR (lower(COALESCE(p.full_name, '')) COLLATE "C" = ${namePh} AND p.id > ${idPh})
        )`
      );
    }

    const limitPlusOne = input.limit + 1;
    const limitPh = bind(limitPlusOne);

    const query = `
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
        lower(COALESCE(p.full_name, '')) COLLATE "C" AS sort_name
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
      WHERE ${where.join("\n  AND ")}
      ORDER BY lower(COALESCE(p.full_name, '')) COLLATE "C" ASC, p.id ASC
      LIMIT ${limitPh}
    `;

    const result = await this.db.query<SearchProfileRow>(query, params);
    const rows = result.rows;
    const hasMore = rows.length > input.limit;
    const finalRows = hasMore ? rows.slice(0, input.limit) : rows;
    const mapped = finalRows.map(mapSearchRow);

    const last = finalRows[finalRows.length - 1];
    const lastCursor =
      last !== undefined
        ? {
            name: last.sort_name,
            id: last.id
          }
        : null;

    return {
      rows: mapped,
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
        p.skills_text,
        p.profile_completed_at,
        p.created_at,
        p.updated_at
      FROM people p
      LEFT JOIN departments d ON d.id = p.department_id
      LEFT JOIN degrees g ON g.id = p.degree_id
      WHERE p.id = $1
        AND p.is_searchable = TRUE
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
}
