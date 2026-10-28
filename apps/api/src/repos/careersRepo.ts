import type { DbExecutor } from "../db/types.js";
import { personIsDiscoverableForViewerSql } from "../lib/demoPersonSql.js";
import { escapeRegexLiteral } from "../lib/matchIntent.js";
import { wordBoundedPattern } from "./matchRepo.js";

/** Someone with a job at the company asked about (their latest entry there). */
export interface CompanyPersonRow {
  id: string;
  full_name: string;
  batch_year: number | null;
  role_title: string;
  org_name: string;
  is_current: boolean;
  open_to_referrals: boolean;
}

export interface ReferralCompanyRow {
  company: string;
  alumni: number;
}

/** Most people the company screen lists; a company with more can be browsed in the directory. */
export const COMPANY_PEOPLE_MAX = 100;
/** Most companies listed under "Companies you can get referred to". */
export const REFERRAL_COMPANIES_MAX = 50;

const OPEN_TO_REFERRALS_SQL = `COALESCE(p.open_to_preferences -> 'selected', '[]'::jsonb) ? 'referrals'`;

export class CareersRepo {
  constructor(private readonly db: DbExecutor) {}

  /**
   * People with a job at a company, matched the way Ask matches a company: the company's own name
   * or its main company's name contains the typed name as whole words, ignoring capitals. One row
   * per person, preferring a current job there.
   */
  async peopleAtCompany(name: string, viewerPersonId: string, viewerIsDemo: boolean): Promise<CompanyPersonRow[]> {
    const pattern = wordBoundedPattern(escapeRegexLiteral(name.trim()));
    const r = await this.db.query<CompanyPersonRow>(
      `
      WITH orgs AS (
        SELECT o.id
        FROM organizations o
        LEFT JOIN organizations canon ON canon.id = o.canonical_organization_id
        WHERE o.approval_status <> 'rejected'
          AND (o.name::text ~* $1 OR canon.name::text ~* $1)
      )
      SELECT * FROM (
        SELECT DISTINCT ON (p.id)
          p.id, p.full_name, p.batch_year, occ.role_title, org.name::text AS org_name, occ.is_current,
          ${OPEN_TO_REFERRALS_SQL} AS open_to_referrals
        FROM occupations occ
        JOIN orgs ON orgs.id = occ.organization_id
        JOIN organizations org ON org.id = occ.organization_id
        JOIN people p ON p.id = occ.person_id
        WHERE p.deleted_at IS NULL
          AND p.suspended_at IS NULL
          AND p.full_name IS NOT NULL
          AND p.profile_completed_at IS NOT NULL
          AND ${personIsDiscoverableForViewerSql("p", viewerIsDemo)}
          AND p.id <> $2::uuid
        ORDER BY p.id, occ.is_current DESC, occ.start_date DESC NULLS LAST, occ.created_at DESC
      ) people
      ORDER BY is_current DESC, open_to_referrals DESC, batch_year DESC NULLS LAST, full_name
      LIMIT $3
      `,
      [pattern, viewerPersonId, COMPANY_PEOPLE_MAX]
    );
    return r.rows;
  }

  /** The directory's own spelling of a company typed in any case (its main company's name if it has one). */
  async displayName(name: string): Promise<string | null> {
    const r = await this.db.query<{ name: string }>(
      `SELECT COALESCE(canon.name, o.name)::text AS name
       FROM organizations o
       LEFT JOIN organizations canon ON canon.id = o.canonical_organization_id
       WHERE lower(o.name::text) = lower($1) AND o.approval_status <> 'rejected'
       LIMIT 1`,
      [name.trim()]
    );
    return r.rows[0]?.name ?? null;
  }

  /** Companies where at least one alum, currently working there, is open to referrals (main company names). */
  async referralCompanies(viewerPersonId: string, viewerIsDemo: boolean): Promise<ReferralCompanyRow[]> {
    const r = await this.db.query<{ company: string; alumni: string }>(
      `
      SELECT COALESCE(canon.name, org.name)::text AS company, COUNT(DISTINCT p.id)::text AS alumni
      FROM occupations occ
      JOIN organizations org ON org.id = occ.organization_id
      LEFT JOIN organizations canon ON canon.id = org.canonical_organization_id
      JOIN people p ON p.id = occ.person_id
      WHERE occ.is_current
        AND org.approval_status <> 'rejected'
        AND p.deleted_at IS NULL
        AND p.suspended_at IS NULL
        AND p.full_name IS NOT NULL
        AND p.profile_completed_at IS NOT NULL
        AND ${personIsDiscoverableForViewerSql("p", viewerIsDemo)}
        AND p.id <> $1::uuid
        AND ${OPEN_TO_REFERRALS_SQL}
      GROUP BY 1
      ORDER BY COUNT(DISTINCT p.id) DESC, lower(COALESCE(canon.name, org.name)::text)
      LIMIT $2
      `,
      [viewerPersonId, REFERRAL_COMPANIES_MAX]
    );
    return r.rows.map((row) => ({ company: row.company, alumni: Number(row.alumni) }));
  }

  /**
   * How many asks in the last `days` named the viewer's current company (Ask questions and Careers
   * lookups). Counted by the company's name, its main company's name, and names linked to it.
   */
  async demandForCurrentCompany(personId: string, days: number): Promise<{ company: string; asks: number } | null> {
    const r = await this.db.query<{ company: string; asks: string }>(
      `
      WITH mine AS (
        SELECT COALESCE(org.canonical_organization_id, org.id) AS main_id
        FROM occupations occ
        JOIN organizations org ON org.id = occ.organization_id
        WHERE occ.person_id = $1 AND occ.is_current AND org.approval_status <> 'rejected'
        ORDER BY occ.start_date DESC NULLS LAST, occ.created_at DESC
        LIMIT 1
      ), names AS (
        SELECT lower(o.name::text) AS n
        FROM organizations o, mine
        WHERE o.id = mine.main_id OR o.canonical_organization_id = mine.main_id
      )
      SELECT (SELECT o.name::text FROM organizations o, mine WHERE o.id = mine.main_id) AS company,
             (SELECT COUNT(*) FROM match_queries q
               WHERE q.created_at >= now() - ($2::int * interval '1 day')
                 AND lower(btrim(q.company)) IN (SELECT n FROM names))::text AS asks
      FROM mine
      `,
      [personId, days]
    );
    const row = r.rows[0];
    return row?.company ? { company: row.company, asks: Number(row.asks) } : null;
  }
}
