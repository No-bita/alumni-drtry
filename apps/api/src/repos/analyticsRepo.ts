import type { DbExecutor } from "../db/types.js";
import { personIsDemoAlumniSql, personIsProductionAlumniSql } from "../lib/demoPersonSql.js";
import { escapeRegexLiteral, roleDefinitionForLabel, countryMatchNames, MATCH_CATEGORIES } from "../lib/matchIntent.js";
import { CATEGORY_OPEN_TO } from "../lib/matchScore.js";
import { wordBoundedPattern } from "./matchRepo.js";
import { env } from "../config/env.js";

/** Meta's free service replies per number per month, and approximate India rates incl. 18% GST (Oct 2026). */
export const WA_FREE_SERVICE_PER_MONTH = 1000;
export const WA_RUPEES_PER_PAID_MESSAGE = 0.136;

/**
 * Everything on the admin analytics screen (/admin/analytics), for one window of 7, 30 or 90 days,
 * plus 12-week trends. Demo and test accounts are excluded wherever a person is involved.
 */
export interface WeeklyPoint {
  /** Monday of the week (ISO date). */
  weekStart: string;
  value: number;
}

export interface DemandRow {
  category: string | null;
  company: string | null;
  role: string | null;
  city: string | null;
  country: string | null;
  questions: number;
  zeroResults: number;
  /** Alumni matching everything the question named (company/role/city/country). */
  supply: number;
  /** Of those, how many picked a help topic that fits the kind of help asked for. */
  supplyOffering: number;
}

export interface AnalyticsReport {
  windowDays: number;
  generatedAt: string;
  northStar: {
    acceptedNotes: number;
    askers: number;
    helpedWithin7Days: number;
    /** Askers whose first note is under 7 days old and not yet accepted: may still be helped. */
    stillWithin7Days: number;
    trendAccepted: WeeklyPoint[];
    trendSent: WeeklyPoint[];
  };
  signIn: {
    starts: number;
    completed: number;
    emailSent: number;
    emailUnconfirmed: number;
    /** Attempts from before delivery was recorded (migration 050). */
    emailUnknown: number;
    failedRejected: number;
    failedUnreachable: number;
    superseded: number;
    sessionsByMethod: Record<string, number>;
    newMembers: number;
    trendNewMembers: WeeklyPoint[];
  };
  onboarding: {
    startedPeople: number;
    completedPeople: number;
    completedOnboardingProfiles: number;
    validationErrors: number;
    steps: Array<{ stage: string; questionId: string; questionIndex: number; people: number }>;
    profiles: { members: number; completed: number; withCurrentRole: number; withPastRole: number; withOpenTo: number };
  };
  asking: {
    questions: number;
    needsDetail: number;
    zeroResults: number;
    withMatches: number;
    byCategory: Array<{ category: string | null; questions: number; needsDetail: number; zeroResults: number }>;
    trendQuestions: WeeklyPoint[];
    search: { searches: number; zeroResults: number; filtersChanged: number; loadMore: number };
  };
  demandSupply: {
    byCategory: Array<{ category: string; questions: number; alumniOffering: number }>;
    top: DemandRow[];
  };
  matching: {
    questionsWithMatches: number;
    notesFromMatch: number;
    byRank: Array<{ rank: number | null; notes: number; accepted: number; declined: number }>;
    /** Notes sent from Ask -> Match, by the kind of help asked for. */
    byCategory: Array<{ category: string | null; notes: number; accepted: number; declined: number; pending: number }>;
  };
  outcomes: {
    sent: number;
    accepted: number;
    declined: number;
    pending: number;
    medianReplyHours: number | null;
    remindersSent: number;
    repliedAfterReminder: number;
    fairness: {
      recipients: number;
      /** Share of notes (0..1) that went to the most-contacted 10% of recipients. */
      top10Share: number | null;
      /** Alumni with 5+ new notes in the last 7 days (the weekly cap). */
      atWeeklyCap: number;
      /** Alumni with 2+ notes older than 7 days in the window and no reply to any. */
      silentAlumni: number;
    };
  };
  wall: {
    posts: number;
    postsWithReply: number;
    replies: number;
    medianFirstReplyHours: number | null;
    expiredWithoutReply: number;
    trendPosts: WeeklyPoint[];
  };
  engagement: {
    activeMembers: number;
    returningMembers: number;
    trendActive: WeeklyPoint[];
    home: Array<{ event: string; count: number; people: number }>;
    browseByLink: Array<{ link: string; count: number }>;
    notifications: { opened: number; clicked: number };
  };
  growth: {
    inviteOpened: number;
    inviteCopied: number;
    inviteWhatsapp: number;
    invitedSignups: { copy: number; whatsapp: number };
    trendInvitedSignups: WeeklyPoint[];
    byBatch: Array<{ batchYear: number; members: number }>;
    byDepartment: Array<{ code: string; name: string; members: number }>;
  };
  whatsapp: {
    linkedMembers: number;
    notesOptedIn: number;
    notesPaused: number;
    stopped: number;
    /** Distinct numbers that texted the bot in the window, and how many were linked in it. */
    numbersTexting: number;
    linkedInWindow: number;
    notesFromBot: number;
    notesFromBotAccepted: number;
    month: {
      inbound: number;
      serviceReplies: number;
      freeServicePerMonth: number;
      templates: number;
      templateCap: number;
      /** Estimate (₹, incl. GST): templates plus service replies past the free tier. Meta's invoice is final. */
      estimatedSpendRupees: number;
    };
    /** Test 1: notes by how the alum was told. */
    byChannel: Array<{ channel: "email" | "whatsapp"; notes: number; accepted: number; declined: number; medianReplyHours: number | null }>;
    /** Test 2: members who joined in the window, by where they arrived from. */
    onboardingByArrival: Array<{ arrival: "whatsapp" | "website"; started: number; finished: number }>;
  };
  operations: {
    orgsPending: number;
    suspended: number;
    deletedInWindow: number;
    admins: number;
    /** Everyone in the directory (not deleted), split by kind; real members are what every other number counts. */
    directory: { total: number; real: number; demo: number; test: number };
  };
}

const n = (v: unknown): number => (v == null ? 0 : Number(v));
const live = (alias: string) => `${alias}.deleted_at IS NULL AND ${personIsProductionAlumniSql(alias)}`;
const inWindow = (col: string) => `${col} >= now() - ($1::int * interval '1 day')`;

const WEEKS = `SELECT generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') AS wk`;

export class AnalyticsRepo {
  constructor(private readonly db: DbExecutor) {}

  private async one<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
    return ((await this.db.query<T>(sql, params)).rows[0] ?? {}) as T;
  }

  private async rows<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.db.query<T>(sql, params)).rows;
  }

  /** Weekly counts over the last 12 weeks; `source` must select a timestamp column named `ts`. */
  private async trend(source: string, distinct = false): Promise<WeeklyPoint[]> {
    const rows = await this.rows<{ wk: Date; c: string }>(
      `
      WITH weeks AS (${WEEKS})
      SELECT w.wk, COUNT(${distinct ? "DISTINCT x.who" : "x.ts"})::text AS c
      FROM weeks w
      LEFT JOIN (${source}) x ON x.ts >= w.wk AND x.ts < w.wk + interval '1 week'
      GROUP BY w.wk ORDER BY w.wk
      `
    );
    return rows.map((r) => ({ weekStart: new Date(r.wk).toISOString().slice(0, 10), value: n(r.c) }));
  }

  private async eventCounts(types: string[], days: number): Promise<Map<string, { count: number; people: number }>> {
    const rows = await this.rows<{ event_type: string; c: string; people: string }>(
      `
      SELECT e.event_type, COUNT(*)::text AS c, COUNT(DISTINCT e.person_id)::text AS people
      FROM beta_usage_events e
      JOIN people p ON p.id = e.person_id
      WHERE ${inWindow("e.occurred_at")} AND ${live("p")} AND e.event_type = ANY($2::text[])
      GROUP BY e.event_type
      `,
      [days, types]
    );
    return new Map(rows.map((r) => [r.event_type, { count: n(r.c), people: n(r.people) }]));
  }

  async report(days: number): Promise<AnalyticsReport> {
    const [northStar, signIn, onboarding, asking, demandSupply, matching, outcomes, wall, engagement, growth, operations, whatsapp] =
      await Promise.all([
        this.northStar(days),
        this.signIn(days),
        this.onboarding(days),
        this.asking(days),
        this.demandSupply(days),
        this.matching(days),
        this.outcomes(days),
        this.wall(days),
        this.engagement(days),
        this.growth(days),
        this.operations(days),
        this.whatsapp(days)
      ]);
    return {
      windowDays: days,
      generatedAt: new Date().toISOString(),
      northStar,
      signIn,
      onboarding,
      asking,
      demandSupply,
      matching,
      outcomes,
      wall,
      engagement,
      growth,
      operations,
      whatsapp
    };
  }

  /** Notes between real members only. */
  private notesFrom = `
    contact_requests cr
    JOIN people ps ON ps.id = cr.sender_person_id
    JOIN people pr ON pr.id = cr.recipient_person_id
    WHERE ${live("ps")} AND ${live("pr")}`;

  private async northStar(days: number): Promise<AnalyticsReport["northStar"]> {
    const [counts, askers, trendAccepted, trendSent] = await Promise.all([
      this.one<{ accepted: string }>(
        `SELECT COUNT(*) FILTER (WHERE cr.status = 'accepted' AND ${inWindow("cr.responded_at")})::text AS accepted
         FROM ${this.notesFrom}`,
        [days]
      ),
      this.one<{ askers: string; helped: string; still: string }>(
        `
        WITH firsts AS (
          SELECT cr.sender_person_id AS who, MIN(cr.created_at) AS first_at
          FROM ${this.notesFrom}
          GROUP BY cr.sender_person_id
        ), cohort AS (
          SELECT f.who, f.first_at,
                 EXISTS (
                   SELECT 1 FROM contact_requests a
                   WHERE a.sender_person_id = f.who AND a.status = 'accepted'
                     AND a.responded_at <= f.first_at + interval '7 days'
                 ) AS helped
          FROM firsts f
          WHERE ${inWindow("f.first_at")}
        )
        SELECT COUNT(*)::text AS askers,
               COUNT(*) FILTER (WHERE helped)::text AS helped,
               COUNT(*) FILTER (WHERE NOT helped AND first_at > now() - interval '7 days')::text AS still
        FROM cohort
        `,
        [days]
      ),
      this.trend(`SELECT cr.responded_at AS ts FROM ${this.notesFrom} AND cr.status = 'accepted'`),
      this.trend(`SELECT cr.created_at AS ts FROM ${this.notesFrom}`)
    ]);
    return {
      acceptedNotes: n(counts.accepted),
      askers: n(askers.askers),
      helpedWithin7Days: n(askers.helped),
      stillWithin7Days: n(askers.still),
      trendAccepted,
      trendSent
    };
  }

  private async signIn(days: number): Promise<AnalyticsReport["signIn"]> {
    const [ch, fails, methods, members, trendNewMembers] = await Promise.all([
      this.one<Record<string, string>>(
        `
        SELECT COUNT(*) FILTER (WHERE ${inWindow("created_at")})::text AS starts,
               COUNT(*) FILTER (WHERE ${inWindow("consumed_at")})::text AS completed,
               COUNT(*) FILTER (WHERE ${inWindow("created_at")} AND delivery = 'sent')::text AS sent,
               COUNT(*) FILTER (WHERE ${inWindow("created_at")} AND delivery = 'unconfirmed')::text AS unconfirmed,
               COUNT(*) FILTER (WHERE ${inWindow("created_at")} AND delivery IS NULL)::text AS unknown,
               COUNT(*) FILTER (WHERE ${inWindow("superseded_at")})::text AS superseded
        FROM auth_challenges
        `,
        [days]
      ),
      this.one<{ rejected: string; unreachable: string }>(
        `SELECT COUNT(*) FILTER (WHERE reason = 'rejected')::text AS rejected,
                COUNT(*) FILTER (WHERE reason = 'unreachable')::text AS unreachable
         FROM auth_delivery_failures WHERE ${inWindow("occurred_at")}`,
        [days]
      ),
      this.rows<{ method: string | null; c: string }>(
        `SELECT s.auth_method AS method, COUNT(*)::text AS c
         FROM sessions s JOIN people p ON p.id = s.person_id
         WHERE ${inWindow("s.created_at")} AND s.rotated_from IS NULL AND ${live("p")}
         GROUP BY s.auth_method`,
        [days]
      ),
      this.one<{ c: string }>(`SELECT COUNT(*)::text AS c FROM people p WHERE ${inWindow("p.created_at")} AND ${live("p")}`, [days]),
      this.trend(`SELECT p.created_at AS ts FROM people p WHERE ${live("p")}`)
    ]);
    const sessionsByMethod: Record<string, number> = {};
    for (const m of methods) sessionsByMethod[m.method ?? "unknown"] = n(m.c);
    return {
      starts: n(ch.starts),
      completed: n(ch.completed),
      emailSent: n(ch.sent),
      emailUnconfirmed: n(ch.unconfirmed),
      emailUnknown: n(ch.unknown),
      failedRejected: n(fails.rejected),
      failedUnreachable: n(fails.unreachable),
      superseded: n(ch.superseded),
      sessionsByMethod,
      newMembers: n(members.c),
      trendNewMembers
    };
  }

  private async onboarding(days: number): Promise<AnalyticsReport["onboarding"]> {
    const [events, steps, done, profiles] = await Promise.all([
      this.eventCounts(["onboarding_started", "onboarding_completed", "onboarding_validation_error"], days),
      this.rows<{ stage: string; question_id: string; question_index: string; people: string }>(
        `
        SELECT COALESCE(e.metadata->>'stage', '') AS stage,
               COALESCE(e.metadata->>'questionId', '') AS question_id,
               MIN(COALESCE((e.metadata->>'questionIndex')::int, 0))::text AS question_index,
               COUNT(DISTINCT e.person_id)::text AS people
        FROM beta_usage_events e JOIN people p ON p.id = e.person_id
        WHERE e.event_type = 'onboarding_step_advanced' AND ${inWindow("e.occurred_at")} AND ${live("p")}
          AND (e.metadata->>'questionIndex') ~ '^[0-9]+$'
        GROUP BY 1, 2
        ORDER BY 1, MIN(COALESCE((e.metadata->>'questionIndex')::int, 0))
        `,
        [days]
      ),
      this.one<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM people p WHERE ${inWindow("p.onboarding_completed_at")} AND ${live("p")}`,
        [days]
      ),
      this.one<Record<string, string>>(
        `
        SELECT COUNT(*)::text AS members,
               COUNT(*) FILTER (WHERE p.profile_completed_at IS NOT NULL)::text AS completed,
               COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM occupations o WHERE o.person_id = p.id AND o.is_current))::text AS with_current,
               COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM occupations o WHERE o.person_id = p.id AND NOT o.is_current))::text AS with_past,
               COUNT(*) FILTER (WHERE jsonb_typeof(p.open_to_preferences -> 'selected') = 'array'
                                  AND jsonb_array_length(p.open_to_preferences -> 'selected') > 0)::text AS with_open_to
        FROM people p WHERE ${live("p")}
        `
      )
    ]);
    return {
      startedPeople: events.get("onboarding_started")?.people ?? 0,
      completedPeople: events.get("onboarding_completed")?.people ?? 0,
      completedOnboardingProfiles: n(done.c),
      validationErrors: events.get("onboarding_validation_error")?.count ?? 0,
      steps: steps.map((s) => ({ stage: s.stage, questionId: s.question_id, questionIndex: n(s.question_index), people: n(s.people) })),
      profiles: {
        members: n(profiles.members),
        completed: n(profiles.completed),
        withCurrentRole: n(profiles.with_current),
        withPastRole: n(profiles.with_past),
        withOpenTo: n(profiles.with_open_to)
      }
    };
  }

  private async asking(days: number): Promise<AnalyticsReport["asking"]> {
    const [byCat, trendQuestions, search] = await Promise.all([
      this.rows<{ category: string | null; q: string; nd: string; zero: string; wm: string }>(
        `
        SELECT category, COUNT(*)::text AS q,
               COUNT(*) FILTER (WHERE needs_detail)::text AS nd,
               COUNT(*) FILTER (WHERE result_count = 0 AND NOT needs_detail)::text AS zero,
               COUNT(*) FILTER (WHERE result_count > 0)::text AS wm
        FROM match_queries WHERE ${inWindow("created_at")}
        GROUP BY category ORDER BY COUNT(*) DESC
        `,
        [days]
      ),
      this.trend(`SELECT created_at AS ts FROM match_queries`),
      this.eventCounts(["search_executed", "search_zero_results", "search_filters_changed", "search_load_more_clicked"], days)
    ]);
    const sum = (k: "q" | "nd" | "zero" | "wm") => byCat.reduce((a, r) => a + n(r[k]), 0);
    return {
      questions: sum("q"),
      needsDetail: sum("nd"),
      zeroResults: sum("zero"),
      withMatches: sum("wm"),
      byCategory: byCat.map((r) => ({ category: r.category, questions: n(r.q), needsDetail: n(r.nd), zeroResults: n(r.zero) })),
      trendQuestions,
      search: {
        searches: search.get("search_executed")?.count ?? 0,
        zeroResults: search.get("search_zero_results")?.count ?? 0,
        filtersChanged: search.get("search_filters_changed")?.count ?? 0,
        loadMore: search.get("search_load_more_clicked")?.count ?? 0
      }
    };
  }

  /** Alumni offering any of these help topics. */
  private offeringSql(alias: string, ph: string): string {
    return `jsonb_typeof(${alias}.open_to_preferences -> 'selected') = 'array'
            AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(${alias}.open_to_preferences -> 'selected') t(v) WHERE t.v = ANY(${ph}::text[]))`;
  }

  private async demandSupply(days: number): Promise<AnalyticsReport["demandSupply"]> {
    const questionsByCat = await this.rows<{ category: string; q: string }>(
      `SELECT category, COUNT(*)::text AS q FROM match_queries
       WHERE ${inWindow("created_at")} AND category IS NOT NULL GROUP BY category`,
      [days]
    );
    const qMap = new Map(questionsByCat.map((r) => [r.category, n(r.q)]));
    const byCategory = await Promise.all(
      MATCH_CATEGORIES.map(async (category) => {
        const offering = await this.one<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM people p
           WHERE ${live("p")} AND p.profile_completed_at IS NOT NULL AND ${this.offeringSql("p", "$1")}`,
          [CATEGORY_OPEN_TO[category]]
        );
        return { category, questions: qMap.get(category) ?? 0, alumniOffering: n(offering.c) };
      })
    );

    const top = await this.rows<{
      category: string | null; company: string | null; role: string | null; city: string | null; country: string | null;
      q: string; zero: string;
    }>(
      `
      SELECT category, company, role, city, country, COUNT(*)::text AS q,
             COUNT(*) FILTER (WHERE result_count = 0 AND NOT needs_detail)::text AS zero
      FROM match_queries
      WHERE ${inWindow("created_at")}
        AND (company IS NOT NULL OR role IS NOT NULL OR city IS NOT NULL OR country IS NOT NULL)
      GROUP BY category, company, role, city, country
      ORDER BY COUNT(*) DESC, COUNT(*) FILTER (WHERE result_count = 0) DESC
      LIMIT 15
      `,
      [days]
    );

    const withSupply = await Promise.all(top.map((row) => this.supplyFor(row)));
    return { byCategory, top: withSupply };
  }

  /** How many real, complete alumni match everything a question named, and how many offer the right help. */
  private async supplyFor(row: {
    category: string | null; company: string | null; role: string | null; city: string | null; country: string | null;
    q: string; zero: string;
  }): Promise<DemandRow> {
    const params: unknown[] = [];
    const bind = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const conds: string[] = [live("p"), "p.profile_completed_at IS NOT NULL"];
    if (row.company) {
      const ph = bind(row.company.toLowerCase());
      conds.push(`EXISTS (SELECT 1 FROM occupations o JOIN organizations org ON org.id = o.organization_id
                          LEFT JOIN organizations canon ON canon.id = org.canonical_organization_id
                          WHERE o.person_id = p.id AND o.is_current
                            AND (lower(org.name::text) = ${ph} OR lower(canon.name::text) = ${ph}))`);
    }
    if (row.role) {
      const def = roleDefinitionForLabel(row.role);
      const terms = def ? def.titleTerms : [row.role.toLowerCase()];
      const ph = bind(wordBoundedPattern(terms.map(escapeRegexLiteral).join("|")));
      conds.push(`EXISTS (SELECT 1 FROM occupations o WHERE o.person_id = p.id AND o.is_current AND o.role_title ~* ${ph})`);
    }
    if (row.city) {
      const ph = bind(row.city.toLowerCase());
      conds.push(`(lower(p.residence_city) = ${ph}
                   OR EXISTS (SELECT 1 FROM canonical_places cp WHERE cp.id = p.residence_canonical_place_id AND lower(cp.city_label) = ${ph}))`);
    } else if (row.country) {
      const names = countryMatchNames(row.country);
      const ph = bind(names.length > 0 ? names : [row.country.toLowerCase()]);
      conds.push(`lower(p.residence_country) = ANY(${ph}::text[])`);
    }
    const wanted = row.category && (MATCH_CATEGORIES as readonly string[]).includes(row.category)
      ? CATEGORY_OPEN_TO[row.category as (typeof MATCH_CATEGORIES)[number]]
      : [];
    const offeringPh = bind(wanted);
    const res = await this.one<{ supply: string; offering: string }>(
      `SELECT COUNT(*)::text AS supply,
              COUNT(*) FILTER (WHERE ${this.offeringSql("p", offeringPh)})::text AS offering
       FROM people p WHERE ${conds.join(" AND ")}`,
      params
    );
    return {
      category: row.category,
      company: row.company,
      role: row.role,
      city: row.city,
      country: row.country,
      questions: n(row.q),
      zeroResults: n(row.zero),
      supply: n(res.supply),
      supplyOffering: n(res.offering)
    };
  }

  private async matching(days: number): Promise<AnalyticsReport["matching"]> {
    const [q, ranks, cats] = await Promise.all([
      this.one<{ wm: string }>(
        `SELECT COUNT(*) FILTER (WHERE result_count > 0)::text AS wm FROM match_queries WHERE ${inWindow("created_at")}`,
        [days]
      ),
      this.rows<{ rank: number | null; c: string; a: string; d: string }>(
        `SELECT cr.source_rank AS rank, COUNT(*)::text AS c,
                COUNT(*) FILTER (WHERE cr.status = 'accepted')::text AS a,
                COUNT(*) FILTER (WHERE cr.status = 'declined')::text AS d
         FROM ${this.notesFrom} AND cr.source IN ('match', 'whatsapp') AND ${inWindow("cr.created_at")}
         GROUP BY cr.source_rank ORDER BY cr.source_rank NULLS LAST`,
        [days]
      ),
      this.rows<{ category: string | null; c: string; a: string; d: string; p: string }>(
        `SELECT cr.source_category AS category, COUNT(*)::text AS c,
                COUNT(*) FILTER (WHERE cr.status = 'accepted')::text AS a,
                COUNT(*) FILTER (WHERE cr.status = 'declined')::text AS d,
                COUNT(*) FILTER (WHERE cr.status = 'pending')::text AS p
         FROM ${this.notesFrom} AND cr.source IN ('match', 'whatsapp') AND ${inWindow("cr.created_at")}
         GROUP BY cr.source_category ORDER BY COUNT(*) DESC`,
        [days]
      )
    ]);
    return {
      questionsWithMatches: n(q.wm),
      notesFromMatch: ranks.reduce((a, r) => a + n(r.c), 0),
      byRank: ranks.map((r) => ({ rank: r.rank == null ? null : Number(r.rank), notes: n(r.c), accepted: n(r.a), declined: n(r.d) })),
      byCategory: cats.map((r) => ({ category: r.category, notes: n(r.c), accepted: n(r.a), declined: n(r.d), pending: n(r.p) }))
    };
  }

  private async outcomes(days: number): Promise<AnalyticsReport["outcomes"]> {
    const [c, median, fair] = await Promise.all([
      this.one<Record<string, string>>(
        `
        SELECT COUNT(*) FILTER (WHERE ${inWindow("cr.created_at")})::text AS sent,
               COUNT(*) FILTER (WHERE ${inWindow("cr.created_at")} AND cr.status = 'accepted')::text AS accepted,
               COUNT(*) FILTER (WHERE ${inWindow("cr.created_at")} AND cr.status = 'declined')::text AS declined,
               COUNT(*) FILTER (WHERE ${inWindow("cr.created_at")} AND cr.status = 'pending')::text AS pending,
               COUNT(*) FILTER (WHERE ${inWindow("cr.reminder_sent_at")})::text AS reminders,
               COUNT(*) FILTER (WHERE ${inWindow("cr.reminder_sent_at")} AND cr.responded_at > cr.reminder_sent_at)::text AS after_reminder
        FROM ${this.notesFrom}
        `,
        [days]
      ),
      this.one<{ h: string | null }>(
        `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (cr.responded_at - cr.created_at)) / 3600.0)::text AS h
         FROM ${this.notesFrom} AND cr.responded_at IS NOT NULL AND ${inWindow("cr.responded_at")}`,
        [days]
      ),
      this.one<Record<string, string | null>>(
        `
        WITH per AS (
          SELECT cr.recipient_person_id AS who, COUNT(*) AS c
          FROM ${this.notesFrom} AND ${inWindow("cr.created_at")}
          GROUP BY cr.recipient_person_id
        ), ranked AS (
          SELECT c, ROW_NUMBER() OVER (ORDER BY c DESC) AS rn, COUNT(*) OVER () AS total_r, SUM(c) OVER () AS total_n FROM per
        ), week AS (
          SELECT cr.recipient_person_id, COUNT(*) AS c
          FROM ${this.notesFrom} AND cr.created_at >= now() - interval '7 days'
          GROUP BY cr.recipient_person_id
        ), silent AS (
          SELECT cr.recipient_person_id
          FROM ${this.notesFrom} AND ${inWindow("cr.created_at")} AND cr.created_at < now() - interval '7 days'
          GROUP BY cr.recipient_person_id
          HAVING COUNT(*) >= 2 AND COUNT(cr.responded_at) = 0
        )
        SELECT (SELECT COUNT(*) FROM per)::text AS recipients,
               (SELECT SUM(c)::float / NULLIF(MAX(total_n), 0) FROM ranked WHERE rn <= CEIL(total_r * 0.1))::text AS top10,
               (SELECT COUNT(*) FROM week WHERE c >= 5)::text AS at_cap,
               (SELECT COUNT(*) FROM silent)::text AS silent
        `,
        [days]
      )
    ]);
    return {
      sent: n(c.sent),
      accepted: n(c.accepted),
      declined: n(c.declined),
      pending: n(c.pending),
      medianReplyHours: median.h == null ? null : Math.round(Number(median.h) * 10) / 10,
      remindersSent: n(c.reminders),
      repliedAfterReminder: n(c.after_reminder),
      fairness: {
        recipients: n(fair.recipients),
        top10Share: fair.top10 == null ? null : Math.round(Number(fair.top10) * 1000) / 1000,
        atWeeklyCap: n(fair.at_cap),
        silentAlumni: n(fair.silent)
      }
    };
  }

  private async wall(days: number): Promise<AnalyticsReport["wall"]> {
    const posts = `intentcasts i JOIN people pa ON pa.id = i.author_person_id WHERE ${live("pa")}`;
    const [c, trendPosts] = await Promise.all([
      this.one<Record<string, string | null>>(
        `
        WITH win AS (
          SELECT i.id, i.created_at,
                 (SELECT MIN(r.created_at) FROM intentcast_responses r WHERE r.intentcast_id = i.id) AS first_reply
          FROM ${posts} AND ${inWindow("i.created_at")}
        )
        SELECT (SELECT COUNT(*) FROM win)::text AS posts,
               (SELECT COUNT(*) FROM win WHERE first_reply IS NOT NULL)::text AS with_reply,
               (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_reply - created_at)) / 3600.0)
                  FROM win WHERE first_reply IS NOT NULL)::text AS median_h,
               (SELECT COUNT(*) FROM intentcast_responses r
                  JOIN people pr ON pr.id = r.responder_person_id
                  WHERE ${inWindow("r.created_at")} AND ${live("pr")})::text AS replies,
               (SELECT COUNT(*) FROM ${posts} AND i.status = 'expired' AND ${inWindow("i.closed_at")}
                  AND NOT EXISTS (SELECT 1 FROM intentcast_responses r WHERE r.intentcast_id = i.id))::text AS expired_no_reply
        `,
        [days]
      ),
      this.trend(`SELECT i.created_at AS ts FROM ${posts}`)
    ]);
    return {
      posts: n(c.posts),
      postsWithReply: n(c.with_reply),
      replies: n(c.replies),
      medianFirstReplyHours: c.median_h == null ? null : Math.round(Number(c.median_h) * 10) / 10,
      expiredWithoutReply: n(c.expired_no_reply),
      trendPosts
    };
  }

  private async engagement(days: number): Promise<AnalyticsReport["engagement"]> {
    const homeEvents = [
      "home_ask_submitted",
      "home_example_clicked",
      "home_browse_clicked",
      "home_wall_post_clicked",
      "home_notes_clicked",
      "home_checklist_clicked",
      "home_checklist_dismissed",
      "home_answer_key_opened",
      "home_answer_key_dismissed"
    ];
    const [active, trendActive, home, browse, notif] = await Promise.all([
      this.one<{ active: string; returning: string }>(
        `
        WITH cur AS (
          SELECT DISTINCT a.person_id FROM member_activity_days a JOIN people p ON p.id = a.person_id
          WHERE a.day > current_date - $1::int AND ${live("p")}
        ), prev AS (
          SELECT DISTINCT a.person_id FROM member_activity_days a
          WHERE a.day > current_date - 2 * $1::int AND a.day <= current_date - $1::int
        )
        SELECT (SELECT COUNT(*) FROM cur)::text AS active,
               (SELECT COUNT(*) FROM cur WHERE person_id IN (SELECT person_id FROM prev))::text AS returning
        `,
        [days]
      ),
      this.trend(
        `SELECT a.day::timestamptz AS ts, a.person_id AS who FROM member_activity_days a JOIN people p ON p.id = a.person_id WHERE ${live("p")}`,
        true
      ),
      this.eventCounts(homeEvents, days),
      this.rows<{ link: string; c: string }>(
        `SELECT COALESCE(e.metadata->>'link', 'unknown') AS link, COUNT(*)::text AS c
         FROM beta_usage_events e JOIN people p ON p.id = e.person_id
         WHERE e.event_type = 'home_browse_clicked' AND ${inWindow("e.occurred_at")} AND ${live("p")}
         GROUP BY 1 ORDER BY COUNT(*) DESC`,
        [days]
      ),
      this.eventCounts(["notifications_panel_opened", "notification_item_clicked"], days)
    ]);
    return {
      activeMembers: n(active.active),
      returningMembers: n(active.returning),
      trendActive,
      home: homeEvents.map((event) => ({ event, count: home.get(event)?.count ?? 0, people: home.get(event)?.people ?? 0 })),
      browseByLink: browse.map((b) => ({ link: b.link, count: n(b.c) })),
      notifications: {
        opened: notif.get("notifications_panel_opened")?.count ?? 0,
        clicked: notif.get("notification_item_clicked")?.count ?? 0
      }
    };
  }

  private async growth(days: number): Promise<AnalyticsReport["growth"]> {
    const [ev, signups, trendInvitedSignups, byBatch, byDept] = await Promise.all([
      this.eventCounts(["invite_opened", "invite_copied", "invite_whatsapp_shared"], days),
      this.rows<{ ch: string; c: string }>(
        `SELECT p.invite_channel AS ch, COUNT(*)::text AS c FROM people p
         WHERE p.invited_by_person_id IS NOT NULL AND ${inWindow("p.created_at")} AND ${live("p")}
         GROUP BY p.invite_channel`,
        [days]
      ),
      this.trend(`SELECT p.created_at AS ts FROM people p WHERE p.invited_by_person_id IS NOT NULL AND ${live("p")}`),
      this.rows<{ batch_year: number; c: string }>(
        `SELECT p.batch_year, COUNT(*)::text AS c FROM people p
         WHERE ${live("p")} AND p.batch_year IS NOT NULL GROUP BY p.batch_year ORDER BY p.batch_year`
      ),
      this.rows<{ code: string; name: string; c: string }>(
        `SELECT d.code, d.name, COUNT(*)::text AS c FROM people p JOIN departments d ON d.id = p.department_id
         WHERE ${live("p")} GROUP BY d.code, d.name ORDER BY COUNT(*) DESC, d.code LIMIT 20`
      )
    ]);
    const ch = new Map(signups.map((s) => [s.ch, n(s.c)]));
    return {
      inviteOpened: ev.get("invite_opened")?.count ?? 0,
      inviteCopied: ev.get("invite_copied")?.count ?? 0,
      inviteWhatsapp: ev.get("invite_whatsapp_shared")?.count ?? 0,
      invitedSignups: { copy: ch.get("copy") ?? 0, whatsapp: ch.get("whatsapp") ?? 0 },
      trendInvitedSignups,
      byBatch: byBatch.map((b) => ({ batchYear: Number(b.batch_year), members: n(b.c) })),
      byDepartment: byDept.map((d) => ({ code: d.code, name: d.name, members: n(d.c) }))
    };
  }

  private async operations(days: number): Promise<AnalyticsReport["operations"]> {
    const c = await this.one<Record<string, string>>(
      `
      SELECT (SELECT COUNT(*) FROM organizations WHERE approval_status = 'pending')::text AS orgs_pending,
             (SELECT COUNT(*) FROM people p WHERE p.suspended_at IS NOT NULL AND ${live("p")})::text AS suspended,
             (SELECT COUNT(*) FROM people p WHERE ${inWindow("p.deleted_at")} AND ${personIsProductionAlumniSql("p")})::text AS deleted,
             (SELECT COUNT(*) FROM people p WHERE p.role IN ('admin', 'super_admin') AND p.deleted_at IS NULL)::text AS admins,
             (SELECT COUNT(*) FROM people p WHERE p.deleted_at IS NULL)::text AS dir_total,
             (SELECT COUNT(*) FROM people p WHERE ${live("p")})::text AS dir_real,
             (SELECT COUNT(*) FROM people p WHERE p.deleted_at IS NULL AND COALESCE(p.is_test_user, FALSE))::text AS dir_test,
             (SELECT COUNT(*) FROM people p WHERE p.deleted_at IS NULL AND NOT COALESCE(p.is_test_user, FALSE)
                AND ${personIsDemoAlumniSql("p")})::text AS dir_demo
      `,
      [days]
    );
    return {
      orgsPending: n(c.orgs_pending),
      suspended: n(c.suspended),
      deletedInWindow: n(c.deleted),
      admins: n(c.admins),
      directory: { total: n(c.dir_total), real: n(c.dir_real), demo: n(c.dir_demo), test: n(c.dir_test) }
    };
  }

  private async whatsapp(days: number): Promise<AnalyticsReport["whatsapp"]> {
    const [contacts, month, channels, arrivals] = await Promise.all([
      this.one<Record<string, string>>(
        `
        SELECT COUNT(*) FILTER (WHERE c.person_id IS NOT NULL AND ${live("p")})::text AS linked,
               COUNT(*) FILTER (WHERE c.person_id IS NOT NULL AND ${live("p")} AND c.notes_opted_in_at IS NOT NULL
                                  AND c.notes_paused_at IS NULL AND c.stopped_at IS NULL)::text AS opted_in,
               COUNT(*) FILTER (WHERE c.notes_paused_at IS NOT NULL)::text AS paused,
               COUNT(*) FILTER (WHERE c.stopped_at IS NOT NULL)::text AS stopped,
               COUNT(*) FILTER (WHERE ${inWindow("c.last_inbound_at")})::text AS texting,
               COUNT(*) FILTER (WHERE ${inWindow("c.linked_at")} AND c.person_id IS NOT NULL)::text AS linked_window,
               (SELECT COUNT(*) FROM ${this.notesFrom} AND cr.source = 'whatsapp' AND ${inWindow("cr.created_at")})::text AS bot_notes,
               (SELECT COUNT(*) FROM ${this.notesFrom} AND cr.source = 'whatsapp' AND cr.status = 'accepted'
                  AND ${inWindow("cr.created_at")})::text AS bot_accepted
        FROM wa_contacts c LEFT JOIN people p ON p.id = c.person_id
        `,
        [days]
      ),
      this.one<Record<string, string>>(
        `
        SELECT COUNT(*) FILTER (WHERE direction = 'in')::text AS inbound,
               COUNT(*) FILTER (WHERE direction = 'out' AND kind <> 'template' AND status <> 'failed')::text AS service,
               COUNT(*) FILTER (WHERE direction = 'out' AND kind = 'template' AND status <> 'failed')::text AS templates
        FROM wa_messages WHERE created_at >= date_trunc('month', now())
        `
      ),
      this.rows<{ ch: "email" | "whatsapp"; c: string; a: string; d: string; h: string | null }>(
        `
        SELECT cr.delivery_channel AS ch, COUNT(*)::text AS c,
               COUNT(*) FILTER (WHERE cr.status = 'accepted')::text AS a,
               COUNT(*) FILTER (WHERE cr.status = 'declined')::text AS d,
               (percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (cr.responded_at - cr.created_at)) / 3600.0)
                  FILTER (WHERE cr.responded_at IS NOT NULL))::text AS h
        FROM ${this.notesFrom} AND cr.delivery_channel IS NOT NULL AND ${inWindow("cr.created_at")}
        GROUP BY cr.delivery_channel
        `,
        [days]
      ),
      this.rows<{ arrival: string; started: string; finished: string }>(
        `
        SELECT CASE WHEN p.signup_channel = 'whatsapp' THEN 'whatsapp' ELSE 'website' END AS arrival,
               COUNT(*)::text AS started,
               COUNT(*) FILTER (WHERE p.onboarding_completed_at IS NOT NULL)::text AS finished
        FROM people p WHERE ${live("p")} AND ${inWindow("p.created_at")}
        GROUP BY 1
        `,
        [days]
      )
    ]);
    const templates = n(month.templates);
    const service = n(month.service);
    const paid = templates + Math.max(0, service - WA_FREE_SERVICE_PER_MONTH);
    const ch = new Map(channels.map((c) => [c.ch, c]));
    const ar = new Map(arrivals.map((a) => [a.arrival, a]));
    return {
      linkedMembers: n(contacts.linked),
      notesOptedIn: n(contacts.opted_in),
      notesPaused: n(contacts.paused),
      stopped: n(contacts.stopped),
      numbersTexting: n(contacts.texting),
      linkedInWindow: n(contacts.linked_window),
      notesFromBot: n(contacts.bot_notes),
      notesFromBotAccepted: n(contacts.bot_accepted),
      month: {
        inbound: n(month.inbound),
        serviceReplies: service,
        freeServicePerMonth: WA_FREE_SERVICE_PER_MONTH,
        templates,
        templateCap: env.WA_MONTHLY_TEMPLATE_CAP,
        estimatedSpendRupees: Math.round(paid * WA_RUPEES_PER_PAID_MESSAGE * 100) / 100
      },
      byChannel: (["email", "whatsapp"] as const).map((channel) => {
        const r = ch.get(channel);
        return {
          channel,
          notes: n(r?.c),
          accepted: n(r?.a),
          declined: n(r?.d),
          medianReplyHours: r?.h == null ? null : Math.round(Number(r.h) * 10) / 10
        };
      }),
      onboardingByArrival: (["whatsapp", "website"] as const).map((arrival) => ({
        arrival,
        started: n(ar.get(arrival)?.started),
        finished: n(ar.get(arrival)?.finished)
      }))
    };
  }
}
