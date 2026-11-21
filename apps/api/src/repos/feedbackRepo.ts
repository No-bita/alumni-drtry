import type { DbExecutor } from "../db/types.js";

export interface FeedbackEntry {
  id: string;
  personId: string;
  /** Snapshot at read time; null when the member has no name on record. */
  authorFullName: string | null;
  message: string;
  createdAt: Date;
}

interface FeedbackRow {
  id: string;
  person_id: string;
  author_full_name: string | null;
  message: string;
  created_at: Date;
}

function toEntry(row: FeedbackRow): FeedbackEntry {
  return {
    id: row.id,
    personId: row.person_id,
    authorFullName: row.author_full_name,
    message: row.message,
    createdAt: row.created_at
  };
}

export class FeedbackRepo {
  constructor(private readonly db: DbExecutor) {}

  async create(personId: string, message: string): Promise<FeedbackEntry> {
    const result = await this.db.query<FeedbackRow>(
      `
      INSERT INTO feedback (person_id, message)
      VALUES ($1::uuid, $2)
      RETURNING id, person_id, message, created_at, NULL::text AS author_full_name
      `,
      [personId, message]
    );
    const row = result.rows[0];
    if (!row) throw new Error("feedback insert returned no row");
    return toEntry(row);
  }

  /** Newest first, capped so the admin screen stays bounded. */
  async listForAdmin(limit = 200): Promise<FeedbackEntry[]> {
    const result = await this.db.query<FeedbackRow>(
      `
      SELECT f.id, f.person_id, f.message, f.created_at, p.full_name AS author_full_name
      FROM feedback f
      LEFT JOIN people p ON p.id = f.person_id
      ORDER BY f.created_at DESC
      LIMIT $1
      `,
      [limit]
    );
    return result.rows.map(toEntry);
  }
}
