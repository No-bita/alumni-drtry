import {
  BULLETIN_AUTHOR_DELETE_UNDO_MINUTES,
  BULLETIN_INTENTCAST_OPEN_DAYS
} from "../constants/bulletin.js";
import type { DbExecutor } from "../db/types.js";

export type IntentcastStatus = "open" | "closed";
export type IntentcastCategory = "hiring" | "mentorship" | "collaboration" | "guidance";

interface IntentcastFeedRow {
  id: string;
  author_person_id: string;
  author_full_name: string;
  author_department_code: string | null;
  author_department_name: string | null;
  author_batch_year: number | null;
  /** Current occupation (is_current), for bulletin UI tooltips. */
  author_current_role_title: string | null;
  author_current_organization_name: string | null;
  content: string;
  category: IntentcastCategory;
  status: IntentcastStatus;
  expires_at: Date;
  closed_at: Date | null;
  closed_reason: string | null;
  created_at: Date;
  editable_until: Date;
  author_soft_deleted_at: Date | null;
  author_delete_purge_at: Date | null;
  response_count: number;
  viewer_has_responded: boolean;
}

export interface IntentcastFeedView {
  id: string;
  authorPersonId: string;
  authorFullName: string;
  authorDepartmentCode: string | null;
  authorDepartmentName: string | null;
  authorBatchYear: number | null;
  /** Primary current role title from `occupations`, if any. */
  authorCurrentRoleTitle: string | null;
  /** Organization name for the current occupation, if any. */
  authorCurrentOrganizationName: string | null;
  content: string;
  category: IntentcastCategory;
  status: IntentcastStatus;
  expiresAt: Date;
  closedAt: Date | null;
  closedReason: string | null;
  createdAt: Date;
  editableUntil: Date;
  authorSoftDeletedAt: Date | null;
  authorDeletePurgeAt: Date | null;
  responseCount: number;
  /** True when the current viewer has already submitted a reply (one reply per post per user). */
  viewerHasResponded: boolean;
}

export interface IntentcastFeedResult {
  items: IntentcastFeedView[];
  hasMore: boolean;
  nextOffset: number | null;
}

interface IntentcastRow {
  id: string;
  author_person_id: string;
  content: string;
  category: IntentcastCategory;
  status: IntentcastStatus;
  expires_at: Date;
  closed_at: Date | null;
  closed_reason: string | null;
  closed_by_person_id: string | null;
  created_at: Date;
  editable_until: Date;
  updated_at: Date;
  author_soft_deleted_at: Date | null;
  author_delete_purge_at: Date | null;
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
  category: IntentcastCategory;
  expiresAt: Date;
}

export interface FeedInput {
  viewerPersonId: string;
  limit: number;
  offset: number;
  category?: IntentcastCategory;
  status?: IntentcastStatus;
  mine?: boolean;
  /**
   * With `mine`, list the viewer’s posts regardless of `expires_at`, and include both open and closed rows
   * (e.g. Career “Post a role” dashboard).
   */
  authorHistory?: boolean;
  /**
   * When true, omit author–soft-deleted rows for every viewer (including the author).
   * Use for public “Opportunities” style feeds where removed posts must not appear at all.
   */
  excludeAuthorSoftDeleted?: boolean;
}

export interface CreateIntentcastResponseInput {
  intentcastId: string;
  responderPersonId: string;
  message: string;
}

/** Rows for in-app notifications: replies to posts authored by `authorPersonId`. */
export interface BulletinResponseNotificationRow {
  responseId: string;
  responseCreatedAt: Date;
  responseMessage: string;
  intentcastId: string;
  intentcastContent: string;
  responderPersonId: string;
  responderFullName: string | null;
}

interface BulletinResponseNotificationSqlRow {
  response_id: string;
  response_created_at: Date;
  response_message: string;
  intentcast_id: string;
  intentcast_content: string;
  responder_person_id: string;
  responder_full_name: string | null;
}

export interface UpdateIntentcastInput {
  intentcastId: string;
  authorPersonId: string;
  content?: string;
  category?: IntentcastCategory;
}

function mapFeedRow(row: IntentcastFeedRow): IntentcastFeedView {
  return {
    id: row.id,
    authorPersonId: row.author_person_id,
    authorFullName: row.author_full_name,
    authorDepartmentCode: row.author_department_code,
    authorDepartmentName: row.author_department_name,
    authorBatchYear: row.author_batch_year != null ? Number(row.author_batch_year) : null,
    authorCurrentRoleTitle: row.author_current_role_title,
    authorCurrentOrganizationName: row.author_current_organization_name,
    content: row.content,
    category: row.category,
    status: row.status,
    expiresAt: row.expires_at,
    closedAt: row.closed_at,
    closedReason: row.closed_reason,
    createdAt: row.created_at,
    editableUntil: row.editable_until,
    authorSoftDeletedAt: row.author_soft_deleted_at,
    authorDeletePurgeAt: row.author_delete_purge_at,
    responseCount: Number(row.response_count),
    viewerHasResponded: Boolean(row.viewer_has_responded)
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
      INSERT INTO intentcasts (author_person_id, content, category, expires_at, editable_until)
      VALUES ($1, $2, $3, $4, now() + interval '5 minutes')
      RETURNING *
      `,
      [input.authorPersonId, input.content, input.category, input.expiresAt]
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
        status = 'closed',
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
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const where: string[] = [
      "p.deleted_at IS NULL",
      "p.suspended_at IS NULL",
      "p.full_name IS NOT NULL"
    ];

    const authorDashboard = Boolean(input.mine && input.authorHistory);
    if (!authorDashboard) {
      where.push("i.expires_at > now()");
    }

    if (authorDashboard) {
      where.push(`(i.status = 'open' OR i.status = 'closed')`);
    } else {
      const statusPh = bind(input.status ?? "open");
      where.push(`i.status = ${statusPh}`);
    }

    if (input.category) {
      const categoryPh = bind(input.category);
      where.push(`i.category = ${categoryPh}`);
    }

    if (input.mine) {
      const minePh = bind(input.viewerPersonId);
      where.push(`i.author_person_id = ${minePh}`);
    }

    const viewerPh = bind(input.viewerPersonId);
    if (input.excludeAuthorSoftDeleted) {
      where.push("i.author_soft_deleted_at IS NULL");
    } else {
      where.push(
        `(i.author_soft_deleted_at IS NULL OR i.author_person_id = ${viewerPh})`
      );
    }

    const limitPh = bind(input.limit + 1);
    const offsetPh = bind(input.offset);

    const result = await this.db.query<IntentcastFeedRow>(
      `
      SELECT
        i.id,
        i.author_person_id,
        p.full_name AS author_full_name,
        COALESCE(d.code, p.department_code) AS author_department_code,
        COALESCE(d.name, p.department_name) AS author_department_name,
        COALESCE(p.batch_year, p.joining_year)::int AS author_batch_year,
        cur_occ.role_title AS author_current_role_title,
        cur_occ.org_name AS author_current_organization_name,
        i.content,
        i.category,
        i.status,
        i.expires_at,
        i.closed_at,
        i.closed_reason,
        i.created_at,
        i.editable_until,
        i.author_soft_deleted_at,
        i.author_delete_purge_at,
        (
          SELECT COUNT(*)::int
          FROM intentcast_responses r
          WHERE r.intentcast_id = i.id
        ) AS response_count,
        EXISTS (
          SELECT 1
          FROM intentcast_responses r_v
          WHERE r_v.intentcast_id = i.id
            AND r_v.responder_person_id = ${viewerPh}
        ) AS viewer_has_responded
      FROM intentcasts i
      JOIN people p ON p.id = i.author_person_id
      LEFT JOIN departments d ON d.id = p.department_id
      LEFT JOIN LATERAL (
        SELECT o.role_title, org.name::text AS org_name
        FROM occupations o
        LEFT JOIN organizations org ON org.id = o.organization_id
        WHERE o.person_id = p.id
          AND o.is_current = TRUE
        ORDER BY o.start_date DESC NULLS LAST, o.created_at DESC
        LIMIT 1
      ) cur_occ ON TRUE
      WHERE ${where.join("\n  AND ")}
      /* Bulletin feed ordering — document in docs/bulletin-feed-ranking.md; update when this changes. */
      ORDER BY
        CASE
          WHEN (
            (SELECT COUNT(*)::int FROM intentcast_responses r WHERE r.intentcast_id = i.id) = 0
            AND i.created_at >= (now() - interval '48 hours')
          ) THEN 0
          ELSE 1
        END ASC,
        i.created_at DESC,
        i.id DESC
      LIMIT ${limitPh}
      OFFSET ${offsetPh}
      `,
      params
    );

    const rows = result.rows;
    const hasMore = rows.length > input.limit;
    const trimmed = hasMore ? rows.slice(0, input.limit) : rows;
    const mapped = trimmed.map(mapFeedRow);

    return {
      items: mapped,
      hasMore,
      nextOffset: hasMore ? input.offset + input.limit : null
    };
  }

  async findFeedItemById(
    intentcastId: string,
    viewerPersonId?: string | null
  ): Promise<IntentcastFeedView | null> {
    const result = await this.db.query<IntentcastFeedRow>(
      `
      SELECT
        i.id,
        i.author_person_id,
        p.full_name AS author_full_name,
        COALESCE(d.code, p.department_code) AS author_department_code,
        COALESCE(d.name, p.department_name) AS author_department_name,
        COALESCE(p.batch_year, p.joining_year)::int AS author_batch_year,
        cur_occ.role_title AS author_current_role_title,
        cur_occ.org_name AS author_current_organization_name,
        i.content,
        i.category,
        i.status,
        i.expires_at,
        i.closed_at,
        i.closed_reason,
        i.created_at,
        i.editable_until,
        i.author_soft_deleted_at,
        i.author_delete_purge_at,
        (
          SELECT COUNT(*)::int
          FROM intentcast_responses r
          WHERE r.intentcast_id = i.id
        ) AS response_count,
        (
          $2::uuid IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM intentcast_responses r_v
            WHERE r_v.intentcast_id = i.id
              AND r_v.responder_person_id = $2::uuid
          )
        ) AS viewer_has_responded
      FROM intentcasts i
      JOIN people p ON p.id = i.author_person_id
      LEFT JOIN departments d ON d.id = p.department_id
      LEFT JOIN LATERAL (
        SELECT o.role_title, org.name::text AS org_name
        FROM occupations o
        LEFT JOIN organizations org ON org.id = o.organization_id
        WHERE o.person_id = p.id
          AND o.is_current = TRUE
        ORDER BY o.start_date DESC NULLS LAST, o.created_at DESC
        LIMIT 1
      ) cur_occ ON TRUE
      WHERE i.id = $1
      LIMIT 1
      `,
      [intentcastId, viewerPersonId ?? null]
    );
    const row = result.rows[0];
    return row ? mapFeedRow(row) : null;
  }

  /**
   * Single bulletin card for deep links / notifications.
   * Author always sees their own row (incl. closed, expired, soft-deleted).
   * Others: same rules as public feed (open, not expired, author has not removed from bulletin).
   */
  async findFeedItemVisibleToViewer(
    intentcastId: string,
    viewerPersonId: string
  ): Promise<IntentcastFeedView | null> {
    const result = await this.db.query<IntentcastFeedRow>(
      `
      SELECT
        i.id,
        i.author_person_id,
        p.full_name AS author_full_name,
        COALESCE(d.code, p.department_code) AS author_department_code,
        COALESCE(d.name, p.department_name) AS author_department_name,
        COALESCE(p.batch_year, p.joining_year)::int AS author_batch_year,
        cur_occ.role_title AS author_current_role_title,
        cur_occ.org_name AS author_current_organization_name,
        i.content,
        i.category,
        i.status,
        i.expires_at,
        i.closed_at,
        i.closed_reason,
        i.created_at,
        i.editable_until,
        i.author_soft_deleted_at,
        i.author_delete_purge_at,
        (
          SELECT COUNT(*)::int
          FROM intentcast_responses r
          WHERE r.intentcast_id = i.id
        ) AS response_count,
        EXISTS (
          SELECT 1
          FROM intentcast_responses r_v
          WHERE r_v.intentcast_id = i.id
            AND r_v.responder_person_id = $2::uuid
        ) AS viewer_has_responded
      FROM intentcasts i
      JOIN people p ON p.id = i.author_person_id
      LEFT JOIN departments d ON d.id = p.department_id
      LEFT JOIN LATERAL (
        SELECT o.role_title, org.name::text AS org_name
        FROM occupations o
        LEFT JOIN organizations org ON org.id = o.organization_id
        WHERE o.person_id = p.id
          AND o.is_current = TRUE
        ORDER BY o.start_date DESC NULLS LAST, o.created_at DESC
        LIMIT 1
      ) cur_occ ON TRUE
      WHERE i.id = $1
        AND p.deleted_at IS NULL
        AND p.suspended_at IS NULL
        AND p.full_name IS NOT NULL
        AND (
          i.author_person_id = $2::uuid
          OR (
            i.expires_at > now()
            AND i.status = 'open'
            AND i.author_soft_deleted_at IS NULL
          )
        )
      LIMIT 1
      `,
      [intentcastId, viewerPersonId]
    );
    const row = result.rows[0];
    return row ? mapFeedRow(row) : null;
  }

  /**
   * Hides the post from non-authors until purge. Extends `expires_at` so TTL close does not run before purge.
   */
  async softDeleteByAuthor(
    intentcastId: string,
    authorPersonId: string,
    purgeAt: Date
  ): Promise<IntentcastRow | null> {
    const result = await this.db.query<IntentcastRow>(
      `
      UPDATE intentcasts
      SET
        author_soft_deleted_at = now(),
        author_delete_purge_at = $3,
        expires_at = GREATEST(expires_at, $3),
        updated_at = now()
      WHERE id = $1
        AND author_person_id = $2
        AND author_soft_deleted_at IS NULL
      RETURNING *
      `,
      [intentcastId, authorPersonId, purgeAt]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Clears author soft-delete within `BULLETIN_AUTHOR_DELETE_UNDO_MINUTES` of removal.
   * Restores `expires_at` to the normal open-post horizon (`created_at` + open days), or soon after now if that horizon has passed.
   */
  async restoreAuthorSoftDeletedIntentcast(
    intentcastId: string,
    authorPersonId: string
  ): Promise<IntentcastRow | null> {
    const undoMins = BULLETIN_AUTHOR_DELETE_UNDO_MINUTES;
    const openDays = BULLETIN_INTENTCAST_OPEN_DAYS;
    const result = await this.db.query<IntentcastRow>(
      `
      UPDATE intentcasts
      SET
        author_soft_deleted_at = NULL,
        author_delete_purge_at = NULL,
        expires_at = GREATEST(
          created_at + make_interval(days => $3),
          now() + interval '1 second'
        ),
        updated_at = now()
      WHERE id = $1
        AND author_person_id = $2
        AND author_soft_deleted_at IS NOT NULL
        AND author_soft_deleted_at > now() - make_interval(mins => $4)
      RETURNING *
      `,
      [intentcastId, authorPersonId, openDays, undoMins]
    );
    return result.rows[0] ?? null;
  }

  /** Permanently remove soft-deleted rows whose retention window has ended (cascades responses). */
  async purgeAuthorSoftDeletedIntentcasts(limit = 500): Promise<number> {
    const result = await this.db.query(
      `
      WITH doomed AS (
        SELECT id
        FROM intentcasts
        WHERE author_delete_purge_at IS NOT NULL
          AND author_delete_purge_at <= now()
        ORDER BY author_delete_purge_at ASC
        LIMIT $1
      )
      DELETE FROM intentcasts i
      USING doomed d
      WHERE i.id = d.id
      `,
      [limit]
    );
    return result.rowCount ?? 0;
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
        AND author_soft_deleted_at IS NULL
      RETURNING *
      `,
      [intentcastId, actorPersonId]
    );
    return result.rows[0] ?? null;
  }

  async updateWithinEditWindow(input: UpdateIntentcastInput): Promise<IntentcastRow | null> {
    const setParts: string[] = [];
    const params: unknown[] = [];
    const bind = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    if (input.content !== undefined) {
      const ph = bind(input.content);
      setParts.push(`content = ${ph}`);
    }
    if (input.category !== undefined) {
      const ph = bind(input.category);
      setParts.push(`category = ${ph}`);
    }
    if (setParts.length === 0) {
      return this.findById(input.intentcastId);
    }

    const idPh = bind(input.intentcastId);
    const authorPh = bind(input.authorPersonId);
    const result = await this.db.query<IntentcastRow>(
      `
      UPDATE intentcasts
      SET
        ${setParts.join(",\n        ")},
        updated_at = now()
      WHERE id = ${idPh}
        AND author_person_id = ${authorPh}
        AND status = 'open'
        AND author_soft_deleted_at IS NULL
        AND editable_until >= now()
      RETURNING *
      `,
      params
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

  async listBulletinResponseNotificationsForAuthor(
    authorPersonId: string,
    limit: number
  ): Promise<BulletinResponseNotificationRow[]> {
    const result = await this.db.query<BulletinResponseNotificationSqlRow>(
      `
      SELECT
        r.id AS response_id,
        r.created_at AS response_created_at,
        r.message AS response_message,
        i.id AS intentcast_id,
        i.content AS intentcast_content,
        p.id AS responder_person_id,
        p.full_name AS responder_full_name
      FROM intentcast_responses r
      JOIN intentcasts i ON i.id = r.intentcast_id
      JOIN people p ON p.id = r.responder_person_id
      WHERE i.author_person_id = $1
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT $2
      `,
      [authorPersonId, limit]
    );
    return result.rows.map((row) => ({
      responseId: row.response_id,
      responseCreatedAt: row.response_created_at,
      responseMessage: row.response_message,
      intentcastId: row.intentcast_id,
      intentcastContent: row.intentcast_content,
      responderPersonId: row.responder_person_id,
      responderFullName: row.responder_full_name
    }));
  }

  async countBulletinResponseNotificationsForAuthor(authorPersonId: string): Promise<number> {
    const result = await this.db.query<{ c: string }>(
      `
      SELECT COUNT(*)::text AS c
      FROM intentcast_responses r
      JOIN intentcasts i ON i.id = r.intentcast_id
      WHERE i.author_person_id = $1
      `,
      [authorPersonId]
    );
    return Number.parseInt(result.rows[0]?.c ?? "0", 10);
  }
}
