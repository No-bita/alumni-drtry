import type { PoolExecutor } from "../db/types.js";

export interface DiscoverySearchSessionInsert {
  viewerPersonId: string;
  querySnapshot: Record<string, unknown>;
  resultIds: string[];
  wideningMessageKey: string | null;
  wideningSummary: string | null;
}

export class DiscoveryAnalyticsRepo {
  constructor(private readonly db: PoolExecutor) {}

  async insertSearchSession(row: DiscoverySearchSessionInsert): Promise<string> {
    const r = await this.db.query<{ id: string }>(
      `
      INSERT INTO discovery_search_sessions (
        viewer_person_id,
        query_snapshot,
        result_ids,
        widening_message_key,
        widening_summary
      )
      VALUES ($1, $2::jsonb, $3::uuid[], $4, $5)
      RETURNING id
      `,
      [
        row.viewerPersonId,
        JSON.stringify(row.querySnapshot),
        row.resultIds,
        row.wideningMessageKey,
        row.wideningSummary
      ]
    );
    const id = r.rows[0]?.id;
    if (!id) throw new Error("discovery_search_sessions insert failed");
    return id;
  }
}
