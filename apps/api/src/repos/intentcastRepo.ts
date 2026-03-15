import type { DbExecutor } from "../db/types.js";

export type IntentcastStatus = "open" | "closed" | "expired";

interface IntentcastFeedRow {
  id: string;
  author_person_id: string;
  author_full_name: string;
  author_department_code: string | null;
  author_department_name: string | null;
  content: string;
  status: IntentcastStatus;
  expires_at: Date;
  closed_at: Date | null;
  closed_reason: string | null;
  created_at: Date;
  response_count: number;
}

interface IntentcastCursorRow {
  created_at: Date;
  id: string;
}

export interface IntentcastFeedView {
  id: string;
  authorPersonId: string;
  authorFullName: string;
  authorDepartmentCode: string | null;
  authorDepartmentName: string | null;
  content: string;
  status: IntentcastStatus;
  expiresAt: Date;
  closedAt: Date | null;
  closedReason: string | null;
  createdAt: Date;
  responseCount: number;
}

export interface IntentcastFeedResult {
  items: IntentcastFeedView[];
  hasMore: boolean;
  lastCursor: { createdAt: string; id: string } | null;
}

interface IntentcastRow {
  id: string;
  author_person_id: string;
  content: string;
  status: IntentcastStatus;
  expires_at: Date;
  closed_at: Date | null;
  closed_reason: string | null;
  closed_by_person_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface IntentcastResponseRow {
  id: string;
  intentcast_id: string;
  responder_person_id: string;
  message: string;
  created_at: Date;
  updated_at: Date;
}

interface IntentcastResponseViewRow extends IntentcastResponseRow {
  responder_full_name: string;
  responder_department_code: string | null;
  responder_department_name: string | null;
}

export interface IntentcastResponseView {
  id: string;
  intentcastId: string;
  responderPersonId: string;
  responderFullName: string;
  responderDepartmentCode: string | null;
  responderDepartmentName: string | null;
  message: string;
  createdAt: Date;
}

export interface CreateIntentcastInput {
  authorPersonId: string;
  content: string;
  expiresAt: Date;
}

export interface FeedInput {
  viewerPersonId: string;
  limit: number;
  cursor?: {
    createdAt: string;
    id: string;
  };
}

export interface CreateIntentcastResponseInput {
  intentcastId: string;
  responderPersonId: string;
  message: string;
}

function mapFeedRow(row: IntentcastFeedRow): IntentcastFeedView {
  return {
    id: row.id,
    authorPersonId: row.author_person_id,
    authorFullName: row.author_full_name,
    authorDepartmentCode: row.author_department_code,
    authorDepartmentName: row.author_department_name,
    content: row.content,
    status: row.status,
    expiresAt: row.expires_at,
    closedAt: row.closed_at,
    closedReason: row.closed_reason,
    createdAt: row.created_at,
    responseCount: Number(row.response_count)
  };
}

function mapResponseRow(row: IntentcastResponseViewRow): IntentcastResponseView {
  return {
    id: row.id,
    intentcastId: row.intentcast_id,
    responderPersonId: row.responder_person_id,
    responderFullName: row.responder_full_name,
    responderDepartmentCode: row.responder_department_code,
    responderDepartmentName: row.responder_department_name,
    message: row.message,
    createdAt: row.created_at
  };
}

export class IntentcastRepo {
  constructor(private readonly db: DbExecutor) {}

  async create(input: CreateIntentcastInput): Promise<IntentcastRow> {
    const result = await this.db.query<IntentcastRow>(
      `
      INSERT INTO intentcasts (author_person_id, content, expires_at)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [input.authorPersonId, input.content, input.expiresAt]
    );
    return result.rows[0]!;
  }

  async findById(intentcastId: string): Promise<IntentcastRow | null> {
    const result = await this.db.query<IntentcastRow>(
      `
      SELECT *
      FROM intentcasts
      WHERE id = $1
      LIMIT 1
      `,
      [intentcastId]
    );
    return result.rows[0] ?? null;
  }

  async expireOpenIntentcasts(limit = 2000): Promise<number> {
    const result = await this.db.query(
      `
      WITH target AS (
        SELECT id
        FROM intentcasts
        WHERE status = 'open'
          AND expires_at <= now()
        ORDER BY expires_at ASC
        LIMIT $1
      )
      UPDATE intentcasts i
      SET
        status = 'expired',
        closed_reason = 'expired',
        closed_at = now(),
        closed_by_person_id = NULL
      FROM target t
      WHERE i.id = t.id
      `,
      [limit]
    );
    return result.rowCount ?? 0;
  }

  async listFeed(input: FeedInput): Promise<IntentcastFeedResult> {
    const params: unknown[] = [];
    const where: string[] = [
      "i.status = 'open'",
      "i.expires_at > now()",
      "p.deleted_at IS NULL",
      "p.suspended_at IS NULL",
      "p.full_name IS NOT NULL"
    ];

    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    if (input.cursor) {
      const createdAtPh = bind(input.cursor.createdAt);
      const idPh = bind(input.cursor.id);
      where.push(
        `(
          i.created_at < ${createdAtPh}::timestamptz
          OR (i.created_at = ${createdAtPh}::timestamptz AND i.id < ${idPh})
        )`
      );
    }

    const limitPh = bind(input.limit + 1);

    const result = await this.db.query<IntentcastFeedRow>(
      `
      SELECT
        i.id,
        i.author_person_id,
        p.full_name AS author_full_name,
        COALESCE(d.code, p.department_code) AS author_department_code,
        COALESCE(d.name, p.department_name) AS author_department_name,
        i.content,
        i.status,
        i.expires_at,
        i.closed_at,
        i.closed_reason,
        i.created_at,
        (
          SELECT COUNT(*)::int
          FROM intentcast_responses r
          WHERE r.intentcast_id = i.id
        ) AS response_count
      FROM intentcasts i
      JOIN people p ON p.id = i.author_person_id
      LEFT JOIN departments d ON d.id = p.department_id
      WHERE ${where.join("\n  AND ")}
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT ${limitPh}
      `,
      params
    );

    const rows = result.rows;
    const hasMore = rows.length > input.limit;
    const trimmed = hasMore ? rows.slice(0, input.limit) : rows;
    const mapped = trimmed.map(mapFeedRow);
    const last = trimmed[trimmed.length - 1] as IntentcastCursorRow | undefined;

    return {
      items: mapped,
      hasMore,
      lastCursor:
        last !== undefined
          ? {
              createdAt: last.created_at.toISOString(),
              id: last.id
            }
          : null
    };
  }

  async findFeedItemById(intentcastId: string): Promise<IntentcastFeedView | null> {
    const result = await this.db.query<IntentcastFeedRow>(
      `
      SELECT
        i.id,
        i.author_person_id,
        p.full_name AS author_full_name,
        COALESCE(d.code, p.department_code) AS author_department_code,
        COALESCE(d.name, p.department_name) AS author_department_name,
        i.content,
        i.status,
        i.expires_at,
        i.closed_at,
        i.closed_reason,
        i.created_at,
        (
          SELECT COUNT(*)::int
          FROM intentcast_responses r
          WHERE r.intentcast_id = i.id
        ) AS response_count
      FROM intentcasts i
      JOIN people p ON p.id = i.author_person_id
      LEFT JOIN departments d ON d.id = p.department_id
      WHERE i.id = $1
      LIMIT 1
      `,
      [intentcastId]
    );
    const row = result.rows[0];
    return row ? mapFeedRow(row) : null;
  }

  async closeManually(intentcastId: string, actorPersonId: string): Promise<IntentcastRow | null> {
    const result = await this.db.query<IntentcastRow>(
      `
      UPDATE intentcasts
      SET
        status = 'closed',
        closed_reason = 'manual',
        closed_at = now(),
        closed_by_person_id = $2
      WHERE id = $1
        AND author_person_id = $2
        AND status = 'open'
      RETURNING *
      `,
      [intentcastId, actorPersonId]
    );
    return result.rows[0] ?? null;
  }

  async createResponse(input: CreateIntentcastResponseInput): Promise<IntentcastResponseRow> {
    const result = await this.db.query<IntentcastResponseRow>(
      `
      INSERT INTO intentcast_responses (intentcast_id, responder_person_id, message)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [input.intentcastId, input.responderPersonId, input.message]
    );
    return result.rows[0]!;
  }

  async listResponsesForIntentcast(intentcastId: string): Promise<IntentcastResponseView[]> {
    const result = await this.db.query<IntentcastResponseViewRow>(
      `
      SELECT
        r.id,
        r.intentcast_id,
        r.responder_person_id,
        r.message,
        r.created_at,
        r.updated_at,
        p.full_name AS responder_full_name,
        COALESCE(d.code, p.department_code) AS responder_department_code,
        COALESCE(d.name, p.department_name) AS responder_department_name
      FROM intentcast_responses r
      JOIN people p ON p.id = r.responder_person_id
      LEFT JOIN departments d ON d.id = p.department_id
      WHERE r.intentcast_id = $1
      ORDER BY r.created_at DESC, r.id DESC
      `,
      [intentcastId]
    );
    return result.rows.map(mapResponseRow);
  }
}
