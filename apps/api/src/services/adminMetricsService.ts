import type { Pool } from "pg";
import type { AdminMetrics } from "../repos/adminMetricsRepo.js";
import { AdminMetricsRepo } from "../repos/adminMetricsRepo.js";
import { AskMatchMetricsRepo, type AskMatchMetrics } from "../repos/askMatchMetricsRepo.js";
import type { BetaUsageEventType } from "../lib/betaUsageEventTypes.js";

export class AdminMetricsService {
  private readonly repo: AdminMetricsRepo;

  private readonly askMatchRepo: AskMatchMetricsRepo;

  constructor(private readonly pool: Pool) {
    this.repo = new AdminMetricsRepo(pool);
    this.askMatchRepo = new AskMatchMetricsRepo(pool);
  }

  /** Ask → Match funnel over the last `windowDays` plus current profile completeness. */
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

  async logBetaUsageEvent(input: {
    eventType: BetaUsageEventType;
    personId: string | null;
    route: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    void input;
    // Analytics disabled — re-enable: await this.repo.logBetaUsageEvent(input);
  }

  async getBetaUsageSummary(windowHours: number) {
    return this.repo.getBetaUsageSummary(windowHours);
  }

  async getBetaUsageExportRows(windowHours: number, limit = 10_000) {
    return this.repo.getBetaUsageExportRows(windowHours, limit);
  }
}
