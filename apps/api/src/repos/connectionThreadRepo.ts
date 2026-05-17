import type { PoolExecutor } from "../db/types.js";
import { personIsDemoSql } from "../lib/demoPersonSql.js";

export type ConnectionThreadStatus = "open" | "closed" | "declined";

export interface ConnectionThreadRow {
  id: string;
  initiator_person_id: string;
  recipient_person_id: string;
  status: ConnectionThreadStatus;
  kind: "general" | "referral";
  created_at: Date;
  updated_at: Date;
}

export interface ConnectionThreadListView {
  id: string;
  initiatorPersonId: string;
  recipientPersonId: string;
  status: ConnectionThreadStatus;
  kind: "general" | "referral";
  updatedAt: Date;
  counterpartyPersonId: string;
  counterpartyFullName: string | null;
  counterpartyDepartmentCode: string | null;
  counterpartyBatchYear: number | null;
  lastMessageBody: string;
  lastMessageAuthorPersonId: string;
  lastMessageCreatedAt: Date;
}

export type ConnectionMessageReplyToSnapshot = {
  messageId: string;
  authorPersonId: string;
  body: string;
};

/** DB row shape for LIST / GET with optional parent snippet join. */
type ConnectionMessageJoinedDbRow = {
  id: string;
  thread_id: string;
  author_person_id: string;
  body: string;
  created_at: Date;
  edited_at: Date | null;
  reply_to_message_id: string | null;
  reply_parent_id: string | null;
  reply_parent_author_person_id: string | null;
  reply_parent_body: string | null;
  author_is_demo: boolean;
};

export interface ConnectionMessageView {
  id: string;
  threadId: string;
  authorPersonId: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  replyTo: ConnectionMessageReplyToSnapshot | null;
  /** Message author is demo/test alumni (for UI badge). */
  authorIsDemo: boolean;
}

export type DisclosureKind =
  | "institutional_email"
  | "personal_email"
  | "mobile_phone"
  | "profile_link";

export interface ConnectionDisclosureView {
  id: string;
  threadId: string;
  personId: string;
  kind: DisclosureKind;
  profileLinkId: string | null;
  disclosedValue: string;
  createdAt: Date;
}

function mapPlainMessageReplyNull(row: {
  id: string;
  thread_id: string;
  author_person_id: string;
  body: string;
  created_at: Date;
  edited_at: Date | null;
}): ConnectionMessageView {
  return {
    id: row.id,
    threadId: row.thread_id,
    authorPersonId: row.author_person_id,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    replyTo: null,
    authorIsDemo: false,
  };
}

function mapJoinedMessage(row: ConnectionMessageJoinedDbRow): ConnectionMessageView {
  const replyTo =
    row.reply_to_message_id &&
    row.reply_parent_id &&
    row.reply_parent_author_person_id != null &&
    row.reply_parent_body != null
      ? {
          messageId: row.reply_parent_id,
          authorPersonId: row.reply_parent_author_person_id,
          body: row.reply_parent_body,
        }
      : null;
  return {
    id: row.id,
    threadId: row.thread_id,
    authorPersonId: row.author_person_id,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    replyTo,
    authorIsDemo: Boolean(row.author_is_demo),
  };
}

function mapDisclosure(row: {
  id: string;
  thread_id: string;
  person_id: string;
  kind: string;
  profile_link_id: string | null;
  disclosed_value: string;
  created_at: Date;
}): ConnectionDisclosureView {
  return {
    id: row.id,
    threadId: row.thread_id,
    personId: row.person_id,
    kind: row.kind as DisclosureKind,
    profileLinkId: row.profile_link_id,
    disclosedValue: row.disclosed_value,
    createdAt: row.created_at
  };
}

export class ConnectionThreadRepo {
  constructor(private readonly db: PoolExecutor) {}

  /** Full message row incl. quoted parent snippet for replies. */
  async getMessageWithReplyJoin(threadId: string, messageId: string): Promise<ConnectionMessageView | null> {
    const result = await this.db.query<ConnectionMessageJoinedDbRow>(
      `
      SELECT
        m.id,
        m.thread_id,
        m.author_person_id,
        m.body,
        m.created_at,
        m.edited_at,
        m.reply_to_message_id,
        rp.id AS reply_parent_id,
        rp.author_person_id AS reply_parent_author_person_id,
        rp.body AS reply_parent_body,
        ${personIsDemoSql("auth_p")} AS author_is_demo
      FROM connection_messages m
      JOIN people auth_p ON auth_p.id = m.author_person_id
      LEFT JOIN connection_messages rp
        ON rp.id = m.reply_to_message_id AND rp.thread_id = m.thread_id
      WHERE m.thread_id = $1 AND m.id = $2
      LIMIT 1
      `,
      [threadId, messageId]
    );
    return result.rows[0] ? mapJoinedMessage(result.rows[0]) : null;
  }

  async findOpenThreadBetween(initiatorId: string, recipientId: string): Promise<ConnectionThreadRow | null> {
    const result = await this.db.query<ConnectionThreadRow>(
      `
      SELECT id, initiator_person_id, recipient_person_id, status, kind, created_at, updated_at
      FROM connection_threads
      WHERE initiator_person_id = $1 AND recipient_person_id = $2 AND status = 'open'
      LIMIT 1
      `,
      [initiatorId, recipientId]
    );
    return result.rows[0] ?? null;
  }

  async findById(threadId: string): Promise<ConnectionThreadRow | null> {
    const result = await this.db.query<ConnectionThreadRow>(
      `
      SELECT id, initiator_person_id, recipient_person_id, status, kind, created_at, updated_at
      FROM connection_threads
      WHERE id = $1
      LIMIT 1
      `,
      [threadId]
    );
    return result.rows[0] ?? null;
  }

  async assertParticipant(threadId: string, personId: string): Promise<ConnectionThreadRow | null> {
    const result = await this.db.query<ConnectionThreadRow>(
      `
      SELECT id, initiator_person_id, recipient_person_id, status, kind, created_at, updated_at
      FROM connection_threads
      WHERE id = $1
        AND (initiator_person_id = $2 OR recipient_person_id = $2)
      LIMIT 1
      `,
      [threadId, personId]
    );
    return result.rows[0] ?? null;
  }

  async createThreadWithFirstMessage(
    initiatorId: string,
    recipientId: string,
    firstMessageBody: string,
    kind: "general" | "referral"
  ): Promise<{ thread: ConnectionThreadRow; message: ConnectionMessageView }> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const t = await client.query<ConnectionThreadRow>(
        `
        INSERT INTO connection_threads (initiator_person_id, recipient_person_id, status, kind)
        VALUES ($1, $2, 'open', $3)
        RETURNING id, initiator_person_id, recipient_person_id, status, kind, created_at, updated_at
        `,
        [initiatorId, recipientId, kind]
      );
      const thread = t.rows[0]!;
      const m = await client.query<{
        id: string;
        thread_id: string;
        author_person_id: string;
        body: string;
        created_at: Date;
        edited_at: Date | null;
      }>(
        `
        INSERT INTO connection_messages (thread_id, author_person_id, body)
        VALUES ($1, $2, $3)
        RETURNING id, thread_id, author_person_id, body, created_at, edited_at
        `,
        [thread.id, initiatorId, firstMessageBody]
      );
      await client.query(`UPDATE connection_threads SET updated_at = now() WHERE id = $1`, [thread.id]);
      await client.query("COMMIT");
      const first = m.rows[0]!;
      const hydrated = await this.getMessageWithReplyJoin(thread.id, first.id);
      return { thread, message: hydrated ?? mapPlainMessageReplyNull(first) };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async addMessage(threadId: string, authorId: string, body: string, replyToMessageId?: string | null): Promise<ConnectionMessageView> {
    const replyId = replyToMessageId ?? null;
    const result = await this.db.query<{
      id: string;
      thread_id: string;
      author_person_id: string;
      body: string;
      created_at: Date;
      edited_at: Date | null;
    }>(
      `
      INSERT INTO connection_messages (thread_id, author_person_id, body, reply_to_message_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, thread_id, author_person_id, body, created_at, edited_at
      `,
      [threadId, authorId, body, replyId]
    );
    await this.db.query(`UPDATE connection_threads SET updated_at = now() WHERE id = $1`, [threadId]);
    const row = result.rows[0]!;
    const hydrated = await this.getMessageWithReplyJoin(threadId, row.id);
    return hydrated ?? mapPlainMessageReplyNull(row);
  }

  async listMessages(threadId: string): Promise<ConnectionMessageView[]> {
    const result = await this.db.query<ConnectionMessageJoinedDbRow>(
      `
      SELECT
        m.id,
        m.thread_id,
        m.author_person_id,
        m.body,
        m.created_at,
        m.edited_at,
        m.reply_to_message_id,
        rp.id AS reply_parent_id,
        rp.author_person_id AS reply_parent_author_person_id,
        rp.body AS reply_parent_body,
        ${personIsDemoSql("auth_p")} AS author_is_demo
      FROM connection_messages m
      JOIN people auth_p ON auth_p.id = m.author_person_id
      LEFT JOIN connection_messages rp
        ON rp.id = m.reply_to_message_id AND rp.thread_id = m.thread_id
      WHERE m.thread_id = $1
      ORDER BY m.created_at ASC, m.id ASC
      `,
      [threadId]
    );
    return result.rows.map(mapJoinedMessage);
  }

  async findMessageInThread(threadId: string, messageId: string): Promise<ConnectionMessageView | null> {
    const result = await this.db.query<{
      id: string;
      thread_id: string;
      author_person_id: string;
      body: string;
      created_at: Date;
      edited_at: Date | null;
    }>(
      `
      SELECT id, thread_id, author_person_id, body, created_at, edited_at
      FROM connection_messages
      WHERE thread_id = $1 AND id = $2
      LIMIT 1
      `,
      [threadId, messageId]
    );
    return result.rows[0] ? mapPlainMessageReplyNull(result.rows[0]) : null;
  }

  async editMessage(threadId: string, messageId: string, body: string): Promise<ConnectionMessageView | null> {
    const result = await this.db.query<{
      id: string;
      thread_id: string;
      author_person_id: string;
      body: string;
      created_at: Date;
      edited_at: Date | null;
    }>(
      `
      UPDATE connection_messages
      SET body = $3, edited_at = now()
      WHERE thread_id = $1 AND id = $2
      RETURNING id, thread_id, author_person_id, body, created_at, edited_at
      `,
      [threadId, messageId, body]
    );
    if ((result.rowCount ?? 0) === 0) {
      return null;
    }
    await this.db.query(`UPDATE connection_threads SET updated_at = now() WHERE id = $1`, [threadId]);
    const hydrated = await this.getMessageWithReplyJoin(threadId, messageId);
    return hydrated ?? mapPlainMessageReplyNull(result.rows[0]!);
  }

  async countMessages(threadId: string): Promise<number> {
    const result = await this.db.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM connection_messages WHERE thread_id = $1`,
      [threadId]
    );
    return parseInt(result.rows[0]?.c ?? "0", 10);
  }

  async countMessagesByAuthor(threadId: string, authorPersonId: string): Promise<number> {
    const result = await this.db.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM connection_messages WHERE thread_id = $1 AND author_person_id = $2`,
      [threadId, authorPersonId]
    );
    return parseInt(result.rows[0]?.c ?? "0", 10);
  }

  async listDisclosures(threadId: string): Promise<ConnectionDisclosureView[]> {
    const result = await this.db.query<{
      id: string;
      thread_id: string;
      person_id: string;
      kind: string;
      profile_link_id: string | null;
      disclosed_value: string;
      created_at: Date;
    }>(
      `
      SELECT id, thread_id, person_id, kind, profile_link_id, disclosed_value::TEXT, created_at
      FROM connection_disclosures
      WHERE thread_id = $1
      ORDER BY created_at ASC
      `,
      [threadId]
    );
    return result.rows.map(mapDisclosure);
  }

  async insertDisclosure(input: {
    threadId: string;
    personId: string;
    kind: DisclosureKind;
    profileLinkId: string | null;
    disclosedValue: string;
  }): Promise<ConnectionDisclosureView> {
    const result = await this.db.query<{
      id: string;
      thread_id: string;
      person_id: string;
      kind: string;
      profile_link_id: string | null;
      disclosed_value: string;
      created_at: Date;
    }>(
      `
      INSERT INTO connection_disclosures (thread_id, person_id, kind, profile_link_id, disclosed_value)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, thread_id, person_id, kind, profile_link_id, disclosed_value::TEXT, created_at
      `,
      [
        input.threadId,
        input.personId,
        input.kind,
        input.profileLinkId,
        input.disclosedValue.trim()
      ]
    );
    return mapDisclosure(result.rows[0]!);
  }

  async hasDisclosureFromPerson(threadId: string, personId: string): Promise<boolean> {
    const result = await this.db.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM connection_disclosures WHERE thread_id = $1 AND person_id = $2`,
      [threadId, personId]
    );
    return parseInt(result.rows[0]?.c ?? "0", 10) > 0;
  }

  async getNudgeDismissal(threadId: string, personId: string): Promise<number | null> {
    const result = await this.db.query<{ dismissed_after_total_messages: number }>(
      `
      SELECT dismissed_after_total_messages
      FROM connection_thread_nudge_dismissals
      WHERE thread_id = $1 AND person_id = $2
      `,
      [threadId, personId]
    );
    const row = result.rows[0];
    return row ? row.dismissed_after_total_messages : null;
  }

  async upsertNudgeDismissal(threadId: string, personId: string, dismissedAfterTotalMessages: number): Promise<void> {
    await this.db.query(
      `
      INSERT INTO connection_thread_nudge_dismissals (thread_id, person_id, dismissed_after_total_messages)
      VALUES ($1, $2, $3)
      ON CONFLICT (thread_id, person_id)
      DO UPDATE SET dismissed_after_total_messages = EXCLUDED.dismissed_after_total_messages, updated_at = now()
      `,
      [threadId, personId, dismissedAfterTotalMessages]
    );
  }

  async setThreadStatus(threadId: string, status: ConnectionThreadStatus): Promise<void> {
    await this.db.query(`UPDATE connection_threads SET status = $2, updated_at = now() WHERE id = $1`, [
      threadId,
      status
    ]);
  }

  async purgeExpiredMessages(retentionDays: number): Promise<void> {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) return;
    const result = await this.db.query<{ thread_id: string }>(
      `
      DELETE FROM connection_messages
      WHERE created_at < now() - ($1::text || ' days')::interval
      RETURNING thread_id
      `,
      [String(retentionDays)]
    );
    const touchedThreadIds = Array.from(new Set(result.rows.map((r) => r.thread_id)));
    if (touchedThreadIds.length === 0) return;
    await this.db.query(
      `
      UPDATE connection_threads t
      SET status = 'closed', updated_at = now()
      WHERE t.id = ANY($1::uuid[])
        AND NOT EXISTS (
          SELECT 1 FROM connection_messages m
          WHERE m.thread_id = t.id
        )
      `,
      [touchedThreadIds]
    );
  }

  async listThreadsForPerson(personId: string, limit: number): Promise<ConnectionThreadListView[]> {
    const result = await this.db.query<{
      id: string;
      initiator_person_id: string;
      recipient_person_id: string;
      status: ConnectionThreadStatus;
      kind: "general" | "referral";
      updated_at: Date;
      counterparty_person_id: string;
      counterparty_full_name: string | null;
      counterparty_department_code: string | null;
      counterparty_batch_year: number | null;
      last_body: string;
      last_author_person_id: string;
      last_created_at: Date;
    }>(
      `
      WITH last_msg AS (
        SELECT DISTINCT ON (thread_id)
          thread_id,
          author_person_id,
          body,
          created_at
        FROM connection_messages
        ORDER BY thread_id, created_at DESC, id DESC
      )
      SELECT
        t.id,
        t.initiator_person_id,
        t.recipient_person_id,
        t.status,
        t.kind,
        t.updated_at,
        CASE
          WHEN t.initiator_person_id = $1 THEN t.recipient_person_id
          ELSE t.initiator_person_id
        END AS counterparty_person_id,
        cp.full_name AS counterparty_full_name,
        COALESCE(dept.code::text, cp.department_code::text) AS counterparty_department_code,
        COALESCE(cp.batch_year, cp.joining_year) AS counterparty_batch_year,
        lm.body AS last_body,
        lm.author_person_id AS last_author_person_id,
        lm.created_at AS last_created_at
      FROM connection_threads t
      JOIN last_msg lm ON lm.thread_id = t.id
      JOIN people cp ON cp.id = (
        CASE
          WHEN t.initiator_person_id = $1 THEN t.recipient_person_id
          ELSE t.initiator_person_id
        END
      )
      LEFT JOIN departments dept ON dept.id = cp.department_id
      WHERE t.initiator_person_id = $1 OR t.recipient_person_id = $1
      ORDER BY t.updated_at DESC
      LIMIT $2
      `,
      [personId, limit]
    );
    return result.rows.map((r) => ({
      id: r.id,
      initiatorPersonId: r.initiator_person_id,
      recipientPersonId: r.recipient_person_id,
      status: r.status,
      kind: r.kind,
      updatedAt: r.updated_at,
      counterpartyPersonId: r.counterparty_person_id,
      counterpartyFullName: r.counterparty_full_name,
      counterpartyDepartmentCode: r.counterparty_department_code,
      counterpartyBatchYear: r.counterparty_batch_year,
      lastMessageBody: r.last_body,
      lastMessageAuthorPersonId: r.last_author_person_id,
      lastMessageCreatedAt: r.last_created_at
    }));
  }

  /** Open threads where the latest message was sent by the other participant. */
  async countThreadNotificationRowsForRecipient(viewerPersonId: string): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `
      WITH last_msg AS (
        SELECT DISTINCT ON (thread_id)
          thread_id,
          author_person_id
        FROM connection_messages
        ORDER BY thread_id, created_at DESC, id DESC
      )
      SELECT COUNT(*)::text AS count
      FROM connection_threads t
      JOIN last_msg lm ON lm.thread_id = t.id
      WHERE (t.initiator_person_id = $1 OR t.recipient_person_id = $1)
        AND t.status = 'open'
        AND lm.author_person_id <> $1
      `,
      [viewerPersonId]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  /** Latest message preview for notifications (other party authored). */
  async listThreadNotificationRowsForRecipient(
    viewerPersonId: string,
    limit: number
  ): Promise<
    {
      threadId: string;
      counterpartyPersonId: string;
      counterpartyFullName: string | null;
      lastBody: string;
      lastAuthorPersonId: string;
      lastCreatedAt: Date;
    }[]
  > {
    const rows = await this.listThreadsForPerson(viewerPersonId, limit);
    return rows
      .filter((r) => r.status === "open" && r.lastMessageAuthorPersonId !== viewerPersonId)
      .map((r) => ({
        threadId: r.id,
        counterpartyPersonId: r.counterpartyPersonId,
        counterpartyFullName: r.counterpartyFullName,
        lastBody: r.lastMessageBody,
        lastAuthorPersonId: r.lastMessageAuthorPersonId,
        lastCreatedAt: r.lastMessageCreatedAt
      }));
  }
}
