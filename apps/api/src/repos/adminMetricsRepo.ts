import type { DbExecutor } from "../db/types.js";
import type { BetaUsageEventType } from "../lib/betaUsageEventTypes.js";
import { betaPersonPredicate } from "../lib/analyticsBetaPersonSql.js";

export interface AdminMetrics {
  totalPeople: number;
  profileCompletedCount: number;
  searchableCount: number;
  searchVolume: number;
  /** Demo vs beta vs admin directory split (people rows). */
  directoryMix: {
    betaProfiles: number;
    demoProfiles: number;
    adminProfiles: number;
    testProfiles: number;
    betaProfilesCompleted: number;
    betaProfilesSearchable: number;
  };
  betaAuthFunnel: {
    attempts: number;
    successes: number;
    failures: number;
    rateLimited: number;
    attempts24h: number;
    successes24h: number;
    failures24h: number;
    rateLimited24h: number;
  };
  betaUsage: {
    searchExecuted24h: number;
    profileViewed24h: number;
    profileClicked24h: number;
    onboardingStarted24h: number;
    onboardingCompleted24h: number;
    searchZeroResults24h: number;
    threadCreated24h: number;
    threadMessageSent24h: number;
    intentcastPosted24h: number;
    intentcastResponded24h: number;
  };
  betaFunnel24h: {
    authSuccesses: number;
    onboardingStarted: number;
    onboardingCompleted: number;
    searchesExecuted: number;
    profilesClicked: number;
    highIntentActions: number;
  };
  betaKpis: {
    onboardingCompletionRate24h: number;
    discoveryCtr24h: number;
    connectionConversionRate24h: number;
    intentcastResponseRate24h: number;
    activeUsers24h: number;
    activeUsers7d: number;
    repeatUsers7d: number;
  };
}

export interface BetaUsageSummary {
  windowHours: number;
  totalEvents: number;
  byEventType: Record<string, number>;
}

export interface BetaUsageExportRow {
  occurredAt: string;
  eventType: string;
  personId: string | null;
  route: string;
  metadata: Record<string, unknown>;
}

export class AdminMetricsRepo {
  constructor(private readonly db: DbExecutor) {}

  async getMetrics(): Promise<AdminMetrics> {
    const betaPerson = betaPersonPredicate("p");
    const [peopleResult, searchResult, betaResult, betaUsageResult, betaDerivedResult] = await Promise.all([
      this.db.query<{
        total: string;
        completed: string;
        searchable: string;
        admin_profiles: string;
        demo_profiles: string;
        beta_profiles: string;
        test_profiles: string;
        beta_completed: string;
        beta_searchable: string;
      }>(
        `
        SELECT
          count(*)::text AS total,
          count(*) FILTER (WHERE profile_completed_at IS NOT NULL)::text AS completed,
          count(*) FILTER (WHERE suspended_at IS NULL)::text AS searchable,
          count(*) FILTER (WHERE role IN ('admin', 'super_admin'))::text AS admin_profiles,
          count(*) FILTER (
            WHERE role = 'alumni'
              AND bio ILIKE '%[DEMO]%'
          )::text AS demo_profiles,
          count(*) FILTER (
            WHERE role = 'alumni'
              AND COALESCE(is_test_user, FALSE) = FALSE
              AND (bio IS NULL OR bio NOT ILIKE '%[DEMO]%')
          )::text AS beta_profiles,
          count(*) FILTER (
            WHERE role = 'alumni'
              AND COALESCE(is_test_user, FALSE) = TRUE
          )::text AS test_profiles,
          count(*) FILTER (
            WHERE role = 'alumni'
              AND COALESCE(is_test_user, FALSE) = FALSE
              AND (bio IS NULL OR bio NOT ILIKE '%[DEMO]%')
              AND profile_completed_at IS NOT NULL
          )::text AS beta_completed,
          count(*) FILTER (
            WHERE role = 'alumni'
              AND COALESCE(is_test_user, FALSE) = FALSE
              AND (bio IS NULL OR bio NOT ILIKE '%[DEMO]%')
              AND suspended_at IS NULL
          )::text AS beta_searchable
        FROM people
        WHERE deleted_at IS NULL
        `
      ),
      this.db.query<{ cnt: string }>(`SELECT count(*)::text AS cnt FROM search_log`),
      this.db.query<{
        attempts: string;
        successes: string;
        failures: string;
        rate_limited: string;
        attempts_24h: string;
        successes_24h: string;
        failures_24h: string;
        rate_limited_24h: string;
      }>(
        `
        SELECT
          count(*) FILTER (WHERE b.event_type = 'invite_attempt')::text AS attempts,
          count(*) FILTER (WHERE b.event_type = 'invite_success')::text AS successes,
          count(*) FILTER (WHERE b.event_type = 'invite_failure')::text AS failures,
          count(*) FILTER (WHERE b.event_type = 'invite_rate_limited')::text AS rate_limited,
          count(*) FILTER (
            WHERE b.event_type = 'invite_attempt'
              AND b.occurred_at >= now() - interval '24 hours'
          )::text AS attempts_24h,
          count(*) FILTER (
            WHERE b.event_type = 'invite_success'
              AND b.occurred_at >= now() - interval '24 hours'
          )::text AS successes_24h,
          count(*) FILTER (
            WHERE b.event_type = 'invite_failure'
              AND b.occurred_at >= now() - interval '24 hours'
          )::text AS failures_24h,
          count(*) FILTER (
            WHERE b.event_type = 'invite_rate_limited'
              AND b.occurred_at >= now() - interval '24 hours'
          )::text AS rate_limited_24h
        FROM beta_auth_events b
        INNER JOIN people p ON p.id = b.person_id
        WHERE ${betaPerson}
        `
      )
      ,
      this.db.query<{
        search_executed_24h: string;
        profile_viewed_24h: string;
        profile_clicked_24h: string;
        onboarding_started_24h: string;
        onboarding_completed_24h: string;
        search_zero_results_24h: string;
        thread_created_24h: string;
        thread_message_sent_24h: string;
        intentcast_posted_24h: string;
        intentcast_responded_24h: string;
      }>(
        `
        SELECT
          count(*) FILTER (WHERE e.event_type = 'search_executed' AND e.occurred_at >= now() - interval '24 hours')::text AS search_executed_24h,
          count(*) FILTER (WHERE e.event_type = 'profile_viewed' AND e.occurred_at >= now() - interval '24 hours')::text AS profile_viewed_24h,
          count(*) FILTER (WHERE e.event_type = 'profile_clicked' AND e.occurred_at >= now() - interval '24 hours')::text AS profile_clicked_24h,
          count(*) FILTER (WHERE e.event_type = 'onboarding_started' AND e.occurred_at >= now() - interval '24 hours')::text AS onboarding_started_24h,
          count(*) FILTER (WHERE e.event_type = 'onboarding_completed' AND e.occurred_at >= now() - interval '24 hours')::text AS onboarding_completed_24h,
          count(*) FILTER (WHERE e.event_type = 'search_zero_results' AND e.occurred_at >= now() - interval '24 hours')::text AS search_zero_results_24h,
          count(*) FILTER (WHERE e.event_type = 'thread_created' AND e.occurred_at >= now() - interval '24 hours')::text AS thread_created_24h,
          count(*) FILTER (WHERE e.event_type = 'thread_message_sent' AND e.occurred_at >= now() - interval '24 hours')::text AS thread_message_sent_24h,
          count(*) FILTER (WHERE e.event_type = 'intentcast_posted' AND e.occurred_at >= now() - interval '24 hours')::text AS intentcast_posted_24h,
          count(*) FILTER (WHERE e.event_type = 'intentcast_responded' AND e.occurred_at >= now() - interval '24 hours')::text AS intentcast_responded_24h
        FROM beta_usage_events e
        INNER JOIN people p ON p.id = e.person_id
        WHERE ${betaPerson}
        `
      )
      ,
      this.db.query<{
        auth_success_24h: string;
        onboarding_started_24h: string;
        onboarding_completed_24h: string;
        searches_executed_24h: string;
        profiles_clicked_24h: string;
        high_intent_actions_24h: string;
        active_users_24h: string;
        active_users_7d: string;
        repeat_users_7d: string;
      }>(
        `
        WITH usage AS (
          SELECT e.*
          FROM beta_usage_events e
          INNER JOIN people p ON p.id = e.person_id
          WHERE ${betaPerson}
        )
        SELECT
          (
            SELECT count(*)::text
            FROM beta_auth_events b
            INNER JOIN people p2 ON p2.id = b.person_id
            WHERE ${betaPersonPredicate("p2")}
              AND b.event_type = 'invite_success'
              AND b.occurred_at >= now() - interval '24 hours'
          ) AS auth_success_24h,
          count(*) FILTER (WHERE event_type = 'onboarding_started' AND occurred_at >= now() - interval '24 hours')::text AS onboarding_started_24h,
          count(*) FILTER (WHERE event_type = 'onboarding_completed' AND occurred_at >= now() - interval '24 hours')::text AS onboarding_completed_24h,
          count(*) FILTER (WHERE event_type = 'search_executed' AND occurred_at >= now() - interval '24 hours')::text AS searches_executed_24h,
          count(*) FILTER (WHERE event_type = 'profile_clicked' AND occurred_at >= now() - interval '24 hours')::text AS profiles_clicked_24h,
          count(*) FILTER (
            WHERE event_type IN ('thread_created', 'intentcast_posted')
              AND occurred_at >= now() - interval '24 hours'
          )::text AS high_intent_actions_24h,
          count(DISTINCT person_id) FILTER (WHERE person_id IS NOT NULL AND occurred_at >= now() - interval '24 hours')::text AS active_users_24h,
          count(DISTINCT person_id) FILTER (WHERE person_id IS NOT NULL AND occurred_at >= now() - interval '7 days')::text AS active_users_7d,
          (
            SELECT count(*)::text
            FROM (
              SELECT person_id
              FROM usage
              WHERE person_id IS NOT NULL
                AND occurred_at >= now() - interval '7 days'
              GROUP BY person_id
              HAVING count(*) >= 2
            ) repeaters
          ) AS repeat_users_7d
        FROM usage
        `
      )
    ]);

    const people = peopleResult.rows[0];
    const search = searchResult.rows[0];
    const beta = betaResult.rows[0];
    const betaUsage = betaUsageResult.rows[0];
    const betaDerived = betaDerivedResult.rows[0];
    const onboardingStarted24h = betaUsage ? parseInt(betaUsage.onboarding_started_24h, 10) : 0;
    const onboardingCompleted24h = betaUsage ? parseInt(betaUsage.onboarding_completed_24h, 10) : 0;
    const searchesExecuted24h = betaUsage ? parseInt(betaUsage.search_executed_24h, 10) : 0;
    const profileClicked24h = betaUsage ? parseInt(betaUsage.profile_clicked_24h, 10) : 0;
    const profileViewed24h = betaUsage ? parseInt(betaUsage.profile_viewed_24h, 10) : 0;
    const threadCreated24h = betaUsage ? parseInt(betaUsage.thread_created_24h, 10) : 0;
    const threadMessageSent24h = betaUsage ? parseInt(betaUsage.thread_message_sent_24h, 10) : 0;
    const intentcastPosted24h = betaUsage ? parseInt(betaUsage.intentcast_posted_24h, 10) : 0;
    const intentcastResponded24h = betaUsage ? parseInt(betaUsage.intentcast_responded_24h, 10) : 0;
    const highIntentActions24h = betaDerived ? parseInt(betaDerived.high_intent_actions_24h, 10) : 0;
    const authSuccess24h = betaDerived ? parseInt(betaDerived.auth_success_24h ?? "0", 10) : 0;
    const activeUsers24h = betaDerived ? parseInt(betaDerived.active_users_24h, 10) : 0;
    const activeUsers7d = betaDerived ? parseInt(betaDerived.active_users_7d, 10) : 0;
    const repeatUsers7d = betaDerived ? parseInt(betaDerived.repeat_users_7d ?? "0", 10) : 0;
    const safeRate = (num: number, den: number) => (den > 0 ? Number(((num / den) * 100).toFixed(1)) : 0);

    return {
      totalPeople: people ? parseInt(people.total, 10) : 0,
      profileCompletedCount: people ? parseInt(people.completed, 10) : 0,
      searchableCount: people ? parseInt(people.searchable, 10) : 0,
      searchVolume: search ? parseInt(search.cnt, 10) : 0,
      directoryMix: {
        betaProfiles: people ? parseInt(people.beta_profiles, 10) : 0,
        demoProfiles: people ? parseInt(people.demo_profiles, 10) : 0,
        adminProfiles: people ? parseInt(people.admin_profiles, 10) : 0,
        testProfiles: people ? parseInt(people.test_profiles, 10) : 0,
        betaProfilesCompleted: people ? parseInt(people.beta_completed, 10) : 0,
        betaProfilesSearchable: people ? parseInt(people.beta_searchable, 10) : 0,
      },
      betaAuthFunnel: {
        attempts: beta ? parseInt(beta.attempts, 10) : 0,
        successes: beta ? parseInt(beta.successes, 10) : 0,
        failures: beta ? parseInt(beta.failures, 10) : 0,
        rateLimited: beta ? parseInt(beta.rate_limited, 10) : 0,
        attempts24h: beta ? parseInt(beta.attempts_24h, 10) : 0,
        successes24h: beta ? parseInt(beta.successes_24h, 10) : 0,
        failures24h: beta ? parseInt(beta.failures_24h, 10) : 0,
        rateLimited24h: beta ? parseInt(beta.rate_limited_24h, 10) : 0
      },
      betaUsage: {
        searchExecuted24h: searchesExecuted24h,
        profileViewed24h,
        profileClicked24h: profileClicked24h,
        onboardingStarted24h,
        onboardingCompleted24h,
        searchZeroResults24h: betaUsage ? parseInt(betaUsage.search_zero_results_24h, 10) : 0,
        threadCreated24h,
        threadMessageSent24h,
        intentcastPosted24h,
        intentcastResponded24h
      },
      betaFunnel24h: {
        authSuccesses: authSuccess24h,
        onboardingStarted: onboardingStarted24h,
        onboardingCompleted: onboardingCompleted24h,
        searchesExecuted: searchesExecuted24h,
        profilesClicked: profileClicked24h,
        highIntentActions: highIntentActions24h,
      },
      betaKpis: {
        onboardingCompletionRate24h: safeRate(onboardingCompleted24h, onboardingStarted24h),
        discoveryCtr24h: safeRate(profileClicked24h, searchesExecuted24h),
        connectionConversionRate24h: safeRate(threadCreated24h, profileViewed24h),
        intentcastResponseRate24h: safeRate(intentcastResponded24h, intentcastPosted24h),
        activeUsers24h,
        activeUsers7d,
        repeatUsers7d,
      },
    };
  }

  async logSearch(): Promise<void> {
    await this.db.query(`INSERT INTO search_log DEFAULT VALUES`);
  }

  async logBetaAuthEvent(input: {
    eventType: "invite_attempt" | "invite_success" | "invite_failure" | "invite_rate_limited";
    personId?: string | null;
    emailDomain?: string | null;
    errorCode?: string | null;
    inviteCodeId?: string | null;
    ip?: string | null;
  }): Promise<void> {
    await this.db.query(
      `
      INSERT INTO beta_auth_events (
        event_type,
        person_id,
        email_domain,
        error_code,
        invite_code_id,
        ip
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        input.eventType,
        input.personId ?? null,
        input.emailDomain ?? null,
        input.errorCode ?? null,
        input.inviteCodeId ?? null,
        input.ip ?? null
      ]
    );
  }

  async logBetaUsageEvent(input: {
    eventType: BetaUsageEventType;
    personId: string | null;
    route: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.query(
      `
      INSERT INTO beta_usage_events (event_type, person_id, route, metadata)
      VALUES ($1, $2, $3, $4::jsonb)
      `,
      [input.eventType, input.personId, input.route, JSON.stringify(input.metadata ?? {})]
    );
  }

  async purgeUsageEventsOlderThan(days: number): Promise<number> {
    const result = await this.db.query(
      `DELETE FROM beta_usage_events WHERE occurred_at < now() - ($1::int * interval '1 day')`,
      [days]
    );
    return result.rowCount ?? 0;
  }

  async getBetaUsageSummary(windowHours: number): Promise<BetaUsageSummary> {
    const betaPerson = betaPersonPredicate("p");
    const result = await this.db.query<{ event_type: string; cnt: string }>(
      `
      SELECT e.event_type, count(*)::text AS cnt
      FROM beta_usage_events e
      INNER JOIN people p ON p.id = e.person_id
      WHERE e.occurred_at >= now() - ($1::text || ' hours')::interval
        AND ${betaPerson}
      GROUP BY e.event_type
      ORDER BY e.event_type ASC
      `,
      [windowHours]
    );
    const byEventType: Record<string, number> = {};
    let total = 0;
    for (const row of result.rows) {
      const count = parseInt(row.cnt, 10);
      byEventType[row.event_type] = count;
      total += count;
    }
    return { windowHours, totalEvents: total, byEventType };
  }

  async getBetaUsageExportRows(windowHours: number, limit = 10_000): Promise<BetaUsageExportRow[]> {
    const betaPerson = betaPersonPredicate("p");
    const result = await this.db.query<{
      occurred_at: Date;
      event_type: string;
      person_id: string | null;
      route: string;
      metadata: Record<string, unknown>;
    }>(
      `
      SELECT e.occurred_at, e.event_type, e.person_id, e.route, e.metadata
      FROM beta_usage_events e
      INNER JOIN people p ON p.id = e.person_id
      WHERE e.occurred_at >= now() - ($1::text || ' hours')::interval
        AND ${betaPerson}
      ORDER BY e.occurred_at DESC
      LIMIT $2
      `,
      [windowHours, limit]
    );
    return result.rows.map((row) => ({
      occurredAt: row.occurred_at.toISOString(),
      eventType: row.event_type,
      personId: row.person_id,
      route: row.route,
      metadata: row.metadata ?? {}
    }));
  }
}
