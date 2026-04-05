import type { DbExecutor } from "../db/types.js";

export interface AdminMetrics {
  totalPeople: number;
  profileCompletedCount: number;
  searchableCount: number;
  searchVolume: number;
}

export class AdminMetricsRepo {
  constructor(private readonly db: DbExecutor) {}

  async getMetrics(): Promise<AdminMetrics> {
    const [peopleResult, searchResult] = await Promise.all([
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
      this.db.query<{ cnt: string }>(`SELECT count(*)::text AS cnt FROM search_log`)
    ]);

    const people = peopleResult.rows[0];
    const search = searchResult.rows[0];

    return {
      totalPeople: people ? parseInt(people.total, 10) : 0,
      profileCompletedCount: people ? parseInt(people.completed, 10) : 0,
      searchableCount: people ? parseInt(people.searchable, 10) : 0,
      searchVolume: search ? parseInt(search.cnt, 10) : 0
    };
  }

  async logSearch(): Promise<void> {
    await this.db.query(`INSERT INTO search_log DEFAULT VALUES`);
  }
}
