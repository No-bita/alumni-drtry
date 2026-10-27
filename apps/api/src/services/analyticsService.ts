import type { DbExecutor } from "../db/types.js";
import { AnalyticsRepo, type AnalyticsReport } from "../repos/analyticsRepo.js";

export const ANALYTICS_WINDOWS = [7, 30, 90] as const;
export type AnalyticsWindow = (typeof ANALYTICS_WINDOWS)[number];
export const ANALYTICS_CACHE_MS = 5 * 60 * 1000;

/** The admin analytics screen's data, cached per window for 5 minutes. */
export class AnalyticsService {
  private readonly repo: AnalyticsRepo;
  private readonly cache = new Map<AnalyticsWindow, { at: number; report: AnalyticsReport }>();

  constructor(
    db: DbExecutor,
    private readonly now: () => number = Date.now
  ) {
    this.repo = new AnalyticsRepo(db);
  }

  async report(days: AnalyticsWindow, opts: { fresh?: boolean } = {}): Promise<AnalyticsReport> {
    const t = this.now();
    const hit = this.cache.get(days);
    if (!opts.fresh && hit && t - hit.at < ANALYTICS_CACHE_MS) return hit.report;
    const report = await this.repo.report(days);
    this.cache.set(days, { at: t, report });
    return report;
  }
}
