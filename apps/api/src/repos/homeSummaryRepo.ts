import type { DbExecutor } from "../db/types.js";
import { personIsDiscoverableForViewerSql } from "../lib/demoPersonSql.js";
import { STUDY_OCCUPATION_TYPE_CODES } from "./matchRepo.js";

/** Home reassurance line: "[N] alumni across [N] companies can help · [N] open to referrals". */
export interface HomeSummaryCounts {
  /** People the Match search can return to this viewer. */
  alumni: number;
  /** Distinct current employers among them (study programmes excluded). */
  companies: number;
  /** Of those people, how many picked "referrals" as something they help with. */
  openToReferrals: number;
}

export class HomeSummaryRepo {
  constructor(private readonly db: DbExecutor) {}

  /** Same eligibility as Match candidates (matchRepo): live, complete, discoverable, not the viewer. */
  async counts(viewerPersonId: string, viewerIsDemo: boolean): Promise<HomeSummaryCounts> {
    const result = await this.db.query<{ alumni: string; companies: string; open_to_referrals: string }>(
      `
      WITH eligible AS (
        SELECT p.id, p.open_to_preferences
        FROM people p
        WHERE p.deleted_at IS NULL
          AND p.suspended_at IS NULL
          AND p.full_name IS NOT NULL
          AND p.profile_completed_at IS NOT NULL
          AND ${personIsDiscoverableForViewerSql("p", viewerIsDemo)}
          AND p.id <> $1::uuid
      )
      SELECT
        (SELECT COUNT(*) FROM eligible)::text AS alumni,
        (SELECT COUNT(DISTINCT o.organization_id)
           FROM occupations o
           JOIN eligible e ON e.id = o.person_id
           LEFT JOIN occupation_types ot ON ot.id = o.occupation_type_id
          WHERE o.is_current
            AND o.organization_id IS NOT NULL
            AND (ot.code IS NULL OR ot.code <> ALL($2::text[])))::text AS companies,
        (SELECT COUNT(*) FROM eligible e
          WHERE jsonb_typeof(e.open_to_preferences -> 'selected') = 'array'
            AND (e.open_to_preferences -> 'selected') ? 'referrals')::text AS open_to_referrals
      `,
      [viewerPersonId, [...STUDY_OCCUPATION_TYPE_CODES]]
    );
    const row = result.rows[0];
    return {
      alumni: Number(row?.alumni ?? 0),
      companies: Number(row?.companies ?? 0),
      openToReferrals: Number(row?.open_to_referrals ?? 0)
    };
  }
}
