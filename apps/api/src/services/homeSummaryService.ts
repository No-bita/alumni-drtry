import type { DbExecutor } from "../db/types.js";
import { HomeSummaryRepo, type HomeSummaryCounts } from "../repos/homeSummaryRepo.js";

export const HOME_SUMMARY_CACHE_MS = 10 * 60 * 1000;
/** Bound memory: oldest entries are dropped first once the map is full. */
const MAX_CACHED_VIEWERS = 5000;

type CacheEntry = { at: number; counts: HomeSummaryCounts };

/** Counts for the Home reassurance line, cached per viewer for 10 minutes. */
export class HomeSummaryService {
  private readonly repo: HomeSummaryRepo;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    db: DbExecutor,
    private readonly now: () => number = Date.now
  ) {
    this.repo = new HomeSummaryRepo(db);
  }

  async summary(viewerPersonId: string, viewerIsDemo: boolean): Promise<HomeSummaryCounts> {
    const key = `${viewerIsDemo ? "demo" : "live"}:${viewerPersonId}`;
    const t = this.now();
    const hit = this.cache.get(key);
    if (hit && t - hit.at < HOME_SUMMARY_CACHE_MS) return hit.counts;

    const counts = await this.repo.counts(viewerPersonId, viewerIsDemo);
    this.cache.delete(key);
    this.cache.set(key, { at: t, counts });
    while (this.cache.size > MAX_CACHED_VIEWERS) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    return counts;
  }
}
