import type { DbExecutor } from "../db/types.js";
import { personIsProductionAlumniSql } from "../lib/demoPersonSql.js";

/**
 * Ask → Match funnel + profile completeness for the admin card.
 * Mirrored as read-only SQL in docs/queries/ (keep both in sync).
 */
export interface AskMatchFunnelRow {
  /** null = no clear category. */
  category: string | null;
  questions: number;
  needsDetail: number;
  withMatches: number;
  notesSent: number;
  notesAccepted: number;
  notesDeclined: number;
  notesPending: number;
  /** Median days from note to reply (accepted or declined); null when none. */
  medianReplyDays: number | null;
}

export interface AskMatchMetrics {
  windowDays: number;
  total: AskMatchFunnelRow;
  byCategory: AskMatchFunnelRow[];
  remindersSent: number;
  profiles: {
    members: number;
    withCurrentRole: number;
    withPastRole: number;
    withOpenTo: number;
    withBio: number;
    withCity: number;
  };
}

interface FunnelSqlRow {
  category: string | null;
  questions: string;
  needs_detail: string;
  with_matches: string;
  notes_sent: string;
  notes_accepted: string;
  notes_declined: string;
  notes_pending: string;
  median_reply_seconds: number | null;
}

function toRow(r: FunnelSqlRow): AskMatchFunnelRow {
  return {
    category: r.category,
    questions: Number(r.questions),
    needsDetail: Number(r.needs_detail),
    withMatches: Number(r.with_matches),
    notesSent: Number(r.notes_sent),
    notesAccepted: Number(r.notes_accepted),
    notesDeclined: Number(r.notes_declined),
    notesPending: Number(r.notes_pending),
    medianReplyDays:
      r.median_reply_seconds === null ? null : Math.round((Number(r.median_reply_seconds) / 86_400) * 10) / 10
  };
}

export class AskMatchMetricsRepo {
  constructor(private readonly db: DbExecutor) {}

  async getMetrics(windowDays: number): Promise<AskMatchMetrics> {
    // GROUPING SETS gives one row per category plus a grand-total row (grp = 1).
    const funnelSql = `
      WITH q AS (
        SELECT category,
               COUNT(*) AS questions,
               COUNT(*) FILTER (WHERE needs_detail) AS needs_detail,
               COUNT(*) FILTER (WHERE result_count > 0) AS with_matches
        FROM match_queries
        WHERE created_at >= now() - ($1::int * interval '1 day')
        GROUP BY category
      ),
      n AS (
        SELECT source_category AS category, status, created_at, responded_at
        FROM contact_requests
        WHERE source IN ('match', 'whatsapp') AND created_at >= now() - ($1::int * interval '1 day')
      ),
      keys AS (
        SELECT category FROM q UNION SELECT category FROM n
      )
      SELECT
        k.category,
        GROUPING(k.category) AS grp,
        COALESCE(SUM(q.questions), 0)::text AS questions,
        COALESCE(SUM(q.needs_detail), 0)::text AS needs_detail,
        COALESCE(SUM(q.with_matches), 0)::text AS with_matches,
        COALESCE(SUM(nn.sent), 0)::text AS notes_sent,
        COALESCE(SUM(nn.accepted), 0)::text AS notes_accepted,
        COALESCE(SUM(nn.declined), 0)::text AS notes_declined,
        COALESCE(SUM(nn.pending), 0)::text AS notes_pending,
        NULL::float8 AS median_reply_seconds
      FROM keys k
      LEFT JOIN q ON q.category IS NOT DISTINCT FROM k.category
      LEFT JOIN (
        SELECT category,
               COUNT(*) AS sent,
               COUNT(*) FILTER (WHERE status = 'accepted') AS accepted,
               COUNT(*) FILTER (WHERE status = 'declined') AS declined,
               COUNT(*) FILTER (WHERE status = 'pending') AS pending
        FROM n GROUP BY category
      ) nn ON nn.category IS NOT DISTINCT FROM k.category
      GROUP BY GROUPING SETS ((k.category), ())
      ORDER BY grp DESC, k.category NULLS LAST
    `;
    const medianSql = `
      SELECT source_category AS category, GROUPING(source_category) AS grp,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (responded_at - created_at))) AS median_reply_seconds
      FROM contact_requests
      WHERE source IN ('match', 'whatsapp') AND responded_at IS NOT NULL
        AND created_at >= now() - ($1::int * interval '1 day')
      GROUP BY GROUPING SETS ((source_category), ())
    `;
    const remindersSql = `
      SELECT COUNT(*)::text AS c FROM contact_requests
      WHERE reminder_sent_at >= now() - ($1::int * interval '1 day')
    `;
    const profilesSql = `
      SELECT
        COUNT(*)::text AS members,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM occupations o WHERE o.person_id = p.id AND o.is_current))::text AS with_current_role,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM occupations o WHERE o.person_id = p.id AND NOT o.is_current))::text AS with_past_role,
        COUNT(*) FILTER (WHERE jsonb_typeof(p.open_to_preferences -> 'selected') = 'array'
                           AND jsonb_array_length(p.open_to_preferences -> 'selected') > 0)::text AS with_open_to,
        COUNT(*) FILTER (WHERE length(btrim(COALESCE(p.bio, ''))) > 0)::text AS with_bio,
        COUNT(*) FILTER (WHERE length(btrim(COALESCE(p.residence_city, ''))) > 0)::text AS with_city
      FROM people p
      WHERE p.deleted_at IS NULL AND p.suspended_at IS NULL
        AND p.full_name IS NOT NULL AND p.profile_completed_at IS NOT NULL
        AND ${personIsProductionAlumniSql("p")}
    `;

    const [funnel, medians, reminders, profiles] = await Promise.all([
      this.db.query<FunnelSqlRow & { grp: number }>(funnelSql, [windowDays]),
      this.db.query<{ category: string | null; grp: number; median_reply_seconds: number | null }>(medianSql, [windowDays]),
      this.db.query<{ c: string }>(remindersSql, [windowDays]),
      this.db.query<Record<string, string>>(profilesSql)
    ]);

    const medianFor = (category: string | null, total: boolean): number | null => {
      const m = medians.rows.find((r) => (total ? Number(r.grp) === 1 : Number(r.grp) === 0 && r.category === category));
      return m?.median_reply_seconds ?? null;
    };

    const emptyTotal: FunnelSqlRow = {
      category: null, questions: "0", needs_detail: "0", with_matches: "0", notes_sent: "0",
      notes_accepted: "0", notes_declined: "0", notes_pending: "0", median_reply_seconds: null
    };
    const totalRaw = funnel.rows.find((r) => Number(r.grp) === 1) ?? emptyTotal;
    const p = profiles.rows[0] ?? {};

    return {
      windowDays,
      total: toRow({ ...totalRaw, category: null, median_reply_seconds: medianFor(null, true) }),
      byCategory: funnel.rows
        .filter((r) => Number(r.grp) === 0)
        .map((r) => toRow({ ...r, median_reply_seconds: medianFor(r.category, false) })),
      remindersSent: Number(reminders.rows[0]?.c ?? 0),
      profiles: {
        members: Number(p.members ?? 0),
        withCurrentRole: Number(p.with_current_role ?? 0),
        withPastRole: Number(p.with_past_role ?? 0),
        withOpenTo: Number(p.with_open_to ?? 0),
        withBio: Number(p.with_bio ?? 0),
        withCity: Number(p.with_city ?? 0)
      }
    };
  }
}
