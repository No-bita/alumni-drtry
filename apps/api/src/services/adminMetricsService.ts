import type { Pool } from "pg";
import type { AdminMetrics } from "../repos/adminMetricsRepo.js";
import { AdminMetricsRepo } from "../repos/adminMetricsRepo.js";
import type { BetaUsageEventType } from "../lib/betaUsageEventTypes.js";

export class AdminMetricsService {
  private readonly repo: AdminMetricsRepo;

  constructor(private readonly pool: Pool) {
    this.repo = new AdminMetricsRepo(pool);
  }

  async getMetrics(): Promise<AdminMetrics> {
    return this.repo.getMetrics();
  }

  async logSearch(): Promise<void> {
    await this.repo.logSearch();
  }

  async logBetaAuthEvent(input: {
    eventType: "invite_attempt" | "invite_success" | "invite_failure" | "invite_rate_limited";
    personId?: string | null;
    emailDomain?: string | null;
    errorCode?: string | null;
    inviteCodeId?: string | null;
    ip?: string | null;
  }): Promise<void> {
    await this.repo.logBetaAuthEvent(input);
  }

  async logBetaUsageEvent(input: {
    eventType: BetaUsageEventType;
    personId: string | null;
    route: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.repo.logBetaUsageEvent(input);
  }

  async getBetaUsageSummary(windowHours: number) {
    return this.repo.getBetaUsageSummary(windowHours);
  }

  async getBetaUsageExportRows(windowHours: number, limit = 10_000) {
    return this.repo.getBetaUsageExportRows(windowHours, limit);
  }
}
