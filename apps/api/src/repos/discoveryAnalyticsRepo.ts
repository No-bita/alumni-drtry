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

  async insertProfileClick(input: {
    searchSessionId: string;
    viewerPersonId: string;
    profileId: string;
    resultPosition: number;
  }): Promise<void> {
    const owner = await this.db.query<{ viewer_person_id: string }>(
      `SELECT viewer_person_id FROM discovery_search_sessions WHERE id = $1`,
      [input.searchSessionId]
    );
    const row = owner.rows[0];
    if (!row || row.viewer_person_id !== input.viewerPersonId) {
      return;
    }

    await this.db.query(
      `
      INSERT INTO discovery_profile_click_events (
        search_session_id,
        viewer_person_id,
        profile_id,
        result_position
      )
      VALUES ($1, $2, $3, $4)
      `,
      [input.searchSessionId, input.viewerPersonId, input.profileId, input.resultPosition]
    );
  }
}
