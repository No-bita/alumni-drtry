import type { Pool } from "pg";
import type { AdminMetrics } from "../repos/adminMetricsRepo.js";
import { AdminMetricsRepo } from "../repos/adminMetricsRepo.js";
import { AskMatchMetricsRepo, type AskMatchMetrics } from "../repos/askMatchMetricsRepo.js";
import { CitiesMetricsRepo, type CitiesMetrics } from "../repos/citiesMetricsRepo.js";
import {
  RECORDED_EVENT_TYPES,
  USAGE_EVENT_RETENTION_DAYS,
  UsageEventRateLimiter,
  sanitizeEventMetadata,
  type BetaUsageEventType
} from "../lib/betaUsageEventTypes.js";

export class AdminMetricsService {
  private readonly repo: AdminMetricsRepo;

  private readonly askMatchRepo: AskMatchMetricsRepo;
  private readonly citiesMetricsRepo: CitiesMetricsRepo;

  private readonly usageLimiter = new UsageEventRateLimiter();

  constructor(private readonly pool: Pool) {
    this.repo = new AdminMetricsRepo(pool);
    this.askMatchRepo = new AskMatchMetricsRepo(pool);
    this.citiesMetricsRepo = new CitiesMetricsRepo(pool);
  }

  /** Ask → Match funnel over the last `windowDays` plus current profile completeness. */
  /** Cities v1: acceptance of Cities notes by category, arrivals, coffee, nudge funnel. */
  async getCitiesMetrics(windowDays = 30): Promise<CitiesMetrics> {
    return this.citiesMetricsRepo.getMetrics(windowDays);
  }

  async getAskMatchMetrics(windowDays = 30): Promise<AskMatchMetrics> {
    return this.askMatchRepo.getMetrics(windowDays);
  }

  async getMetrics(): Promise<AdminMetrics> {
    return this.repo.getMetrics();
  }

  async logSearch(): Promise<void> {
    // Analytics disabled — re-enable: await this.repo.logSearch();
  }

  async logBetaAuthEvent(input: {
    eventType: "invite_attempt" | "invite_success" | "invite_failure" | "invite_rate_limited";
    personId?: string | null;
    emailDomain?: string | null;
    errorCode?: string | null;
    inviteCodeId?: string | null;
    ip?: string | null;
  }): Promise<void> {
    void input;
    // Analytics disabled — re-enable: await this.repo.logBetaAuthEvent(input);
  }

  /**
   * Usage events for the analytics screen: only approved event types are stored, metadata is cut
   * down to short known keys, demo accounts are skipped, and each person is capped per minute.
   * Returns whether the event was stored.
   */
  async logBetaUsageEvent(input: {
    eventType: BetaUsageEventType;
    personId: string | null;
    route: string;
    metadata?: Record<string, unknown>;
    isDemo?: boolean;
  }): Promise<boolean> {
    if (!RECORDED_EVENT_TYPES.has(input.eventType) || input.isDemo || !input.personId) return false;
    if (!this.usageLimiter.allow(input.personId)) return false;
    await this.repo.logBetaUsageEvent({
      eventType: input.eventType,
      personId: input.personId,
      route: input.route.split("?")[0]!.slice(0, 256),
      metadata: sanitizeEventMetadata(input.metadata)
    });
    return true;
  }

  /** Housekeeping: delete usage events past the retention window. */
  async purgeOldUsageEvents(): Promise<number> {
    return this.repo.purgeUsageEventsOlderThan(USAGE_EVENT_RETENTION_DAYS);
  }

  async getBetaUsageSummary(windowHours: number) {
    return this.repo.getBetaUsageSummary(windowHours);
  }

  async getBetaUsageExportRows(windowHours: number, limit = 10_000) {
    return this.repo.getBetaUsageExportRows(windowHours, limit);
  }
}
