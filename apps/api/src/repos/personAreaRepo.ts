import type { DbExecutor } from "../db/types.js";
import { personIsDiscoverableForViewerSql } from "../lib/demoPersonSql.js";
import { escapeLikePattern } from "../lib/personAreas.js";

export interface AreaSuggestion {
  /** The spelling most members use. */
  label: string;
  /** How many members list it. */
  memberCount: number;
}

export class PersonAreaRepo {
  constructor(private readonly db: DbExecutor) {}

  /** A member's areas, in the order they arranged them. */
  async listByPerson(personId: string): Promise<string[]> {
    const result = await this.db.query<{ label: string }>(
      `SELECT label FROM person_areas WHERE person_id = $1 ORDER BY position ASC`,
      [personId]
    );
    return result.rows.map((row) => row.label);
  }

  /** Serialise two saves of the same member's list (call inside the transaction, before replacing). */
  async lockPerson(personId: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM people WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [personId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Replace a member's whole list. Run inside a transaction (the caller's client) so a reader never
   * sees a half-written list. `labels` must already be normalised and unique.
   */
  async replaceForPerson(personId: string, labels: readonly string[]): Promise<void> {
    await this.db.query(`DELETE FROM person_areas WHERE person_id = $1`, [personId]);
    if (labels.length === 0) return;
    await this.db.query(
      `
      INSERT INTO person_areas (person_id, label, position)
      SELECT $1::uuid, item.label, (item.ord - 1)::smallint
      FROM unnest($2::text[]) WITH ORDINALITY AS item(label, ord)
      `,
      [personId, labels]
    );
  }

  /**
   * Areas other members already use whose words start with `query` ("pri" finds "Pricing" and
   * "Dynamic pricing"), most-used first. Only members who'd appear in search count, so a demo viewer
   * sees demo areas and real members never see demo ones.
   */
  async suggest(query: string, viewerIsDemo: boolean, limit: number): Promise<AreaSuggestion[]> {
    const prefix = escapeLikePattern(query.toLowerCase());
    const result = await this.db.query<{ label: string; member_count: number }>(
      `
      SELECT
        mode() WITHIN GROUP (ORDER BY pa.label) AS label,
        COUNT(DISTINCT pa.person_id)::integer AS member_count
      FROM person_areas pa
      JOIN people p ON p.id = pa.person_id
      WHERE (pa.label_key LIKE $1 || '%' OR pa.label_key LIKE '% ' || $1 || '%')
        AND p.deleted_at IS NULL
        AND p.suspended_at IS NULL
        AND p.profile_completed_at IS NOT NULL
        AND ${personIsDiscoverableForViewerSql("p", viewerIsDemo)}
      GROUP BY pa.label_key
      ORDER BY member_count DESC, pa.label_key ASC
      LIMIT $2
      `,
      [prefix, limit]
    );
    return result.rows.map((row) => ({ label: row.label, memberCount: row.member_count }));
  }
}
