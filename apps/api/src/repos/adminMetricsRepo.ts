import type { DbExecutor } from "../db/types.js";

export interface AdminMetrics {
  totalPeople: number;
  profileCompletedCount: number;
  searchableCount: number;
  searchVolume: number;
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
    threadCreated24h: number;
    threadMessageSent24h: number;
    intentcastPosted24h: number;
    intentcastResponded24h: number;
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
    const [peopleResult, searchResult, betaResult, betaUsageResult] = await Promise.all([
      this.db.query<{
        total: string;
        completed: string;
        searchable: string;
      }>(
        `
        SELECT
          count(*)::text AS total,
          count(*) FILTER (WHERE profile_completed_at IS NOT NULL)::text AS completed,
          count(*) FILTER (WHERE suspended_at IS NULL)::text AS searchable
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
          count(*) FILTER (WHERE event_type = 'invite_attempt')::text AS attempts,
          count(*) FILTER (WHERE event_type = 'invite_success')::text AS successes,
          count(*) FILTER (WHERE event_type = 'invite_failure')::text AS failures,
          count(*) FILTER (WHERE event_type = 'invite_rate_limited')::text AS rate_limited,
          count(*) FILTER (
            WHERE event_type = 'invite_attempt'
              AND occurred_at >= now() - interval '24 hours'
          )::text AS attempts_24h,
          count(*) FILTER (
            WHERE event_type = 'invite_success'
              AND occurred_at >= now() - interval '24 hours'
          )::text AS successes_24h,
          count(*) FILTER (
            WHERE event_type = 'invite_failure'
              AND occurred_at >= now() - interval '24 hours'
          )::text AS failures_24h,
          count(*) FILTER (
            WHERE event_type = 'invite_rate_limited'
              AND occurred_at >= now() - interval '24 hours'
          )::text AS rate_limited_24h
        FROM beta_auth_events
        `
      )
      ,
      this.db.query<{
        search_executed_24h: string;
        profile_viewed_24h: string;
        profile_clicked_24h: string;
        thread_created_24h: string;
        thread_message_sent_24h: string;
        intentcast_posted_24h: string;
        intentcast_responded_24h: string;
      }>(
        `
        SELECT
          count(*) FILTER (WHERE event_type = 'search_executed' AND occurred_at >= now() - interval '24 hours')::text AS search_executed_24h,
          count(*) FILTER (WHERE event_type = 'profile_viewed' AND occurred_at >= now() - interval '24 hours')::text AS profile_viewed_24h,
          count(*) FILTER (WHERE event_type = 'profile_clicked' AND occurred_at >= now() - interval '24 hours')::text AS profile_clicked_24h,
          count(*) FILTER (WHERE event_type = 'thread_created' AND occurred_at >= now() - interval '24 hours')::text AS thread_created_24h,
          count(*) FILTER (WHERE event_type = 'thread_message_sent' AND occurred_at >= now() - interval '24 hours')::text AS thread_message_sent_24h,
          count(*) FILTER (WHERE event_type = 'intentcast_posted' AND occurred_at >= now() - interval '24 hours')::text AS intentcast_posted_24h,
          count(*) FILTER (WHERE event_type = 'intentcast_responded' AND occurred_at >= now() - interval '24 hours')::text AS intentcast_responded_24h
        FROM beta_usage_events
        `
      )
    ]);

    const people = peopleResult.rows[0];
    const search = searchResult.rows[0];
    const beta = betaResult.rows[0];
    const betaUsage = betaUsageResult.rows[0];

    return {
      totalPeople: people ? parseInt(people.total, 10) : 0,
      profileCompletedCount: people ? parseInt(people.completed, 10) : 0,
      searchableCount: people ? parseInt(people.searchable, 10) : 0,
      searchVolume: search ? parseInt(search.cnt, 10) : 0,
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
        searchExecuted24h: betaUsage ? parseInt(betaUsage.search_executed_24h, 10) : 0,
        profileViewed24h: betaUsage ? parseInt(betaUsage.profile_viewed_24h, 10) : 0,
        profileClicked24h: betaUsage ? parseInt(betaUsage.profile_clicked_24h, 10) : 0,
        threadCreated24h: betaUsage ? parseInt(betaUsage.thread_created_24h, 10) : 0,
        threadMessageSent24h: betaUsage ? parseInt(betaUsage.thread_message_sent_24h, 10) : 0,
        intentcastPosted24h: betaUsage ? parseInt(betaUsage.intentcast_posted_24h, 10) : 0,
        intentcastResponded24h: betaUsage ? parseInt(betaUsage.intentcast_responded_24h, 10) : 0
      }
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
    eventType:
      | "search_executed"
      | "profile_viewed"
      | "profile_clicked"
      | "thread_created"
      | "thread_message_sent"
      | "intentcast_posted"
      | "intentcast_responded";
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

  async getBetaUsageSummary(windowHours: number): Promise<BetaUsageSummary> {
    const result = await this.db.query<{ event_type: string; cnt: string }>(
      `
      SELECT event_type, count(*)::text AS cnt
      FROM beta_usage_events
      WHERE occurred_at >= now() - ($1::text || ' hours')::interval
      GROUP BY event_type
      ORDER BY event_type ASC
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
    const result = await this.db.query<{
      occurred_at: Date;
      event_type: string;
      person_id: string | null;
      route: string;
      metadata: Record<string, unknown>;
    }>(
      `
      SELECT occurred_at, event_type, person_id, route, metadata
      FROM beta_usage_events
      WHERE occurred_at >= now() - ($1::text || ' hours')::interval
      ORDER BY occurred_at DESC
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
