import type { PoolExecutor } from "../db/types.js";

export type ConnectionThreadStatus = "open" | "closed" | "declined";

export interface ConnectionThreadRow {
  id: string;
  initiator_person_id: string;
  recipient_person_id: string;
  status: ConnectionThreadStatus;
  created_at: Date;
  updated_at: Date;
}

export interface ConnectionThreadListView {
  id: string;
  initiatorPersonId: string;
  recipientPersonId: string;
  status: ConnectionThreadStatus;
  updatedAt: Date;
  counterpartyPersonId: string;
  counterpartyFullName: string | null;
  lastMessageBody: string;
  lastMessageAuthorPersonId: string;
  lastMessageCreatedAt: Date;
}

export interface ConnectionMessageView {
  id: string;
  threadId: string;
  authorPersonId: string;
  body: string;
  createdAt: Date;
}

export type DisclosureKind = "institutional_email" | "personal_email" | "profile_link";

export interface ConnectionDisclosureView {
  id: string;
  threadId: string;
  personId: string;
  kind: DisclosureKind;
  profileLinkId: string | null;
  disclosedValue: string;
  createdAt: Date;
}

function mapMessage(row: {
  id: string;
  thread_id: string;
  author_person_id: string;
  body: string;
  created_at: Date;
}): ConnectionMessageView {
  return {
    id: row.id,
    threadId: row.thread_id,
    authorPersonId: row.author_person_id,
    body: row.body,
    createdAt: row.created_at
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

  async findOpenThreadBetween(initiatorId: string, recipientId: string): Promise<ConnectionThreadRow | null> {
    const result = await this.db.query<ConnectionThreadRow>(
      `
      SELECT id, initiator_person_id, recipient_person_id, status, created_at, updated_at
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
      SELECT id, initiator_person_id, recipient_person_id, status, created_at, updated_at
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
      SELECT id, initiator_person_id, recipient_person_id, status, created_at, updated_at
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
    firstMessageBody: string
  ): Promise<{ thread: ConnectionThreadRow; message: ConnectionMessageView }> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const t = await client.query<ConnectionThreadRow>(
        `
        INSERT INTO connection_threads (initiator_person_id, recipient_person_id, status)
        VALUES ($1, $2, 'open')
        RETURNING id, initiator_person_id, recipient_person_id, status, created_at, updated_at
        `,
        [initiatorId, recipientId]
      );
      const thread = t.rows[0]!;
      const m = await client.query<{
        id: string;
        thread_id: string;
        author_person_id: string;
        body: string;
        created_at: Date;
      }>(
        `
        INSERT INTO connection_messages (thread_id, author_person_id, body)
        VALUES ($1, $2, $3)
        RETURNING id, thread_id, author_person_id, body, created_at
        `,
        [thread.id, initiatorId, firstMessageBody]
      );
      await client.query(`UPDATE connection_threads SET updated_at = now() WHERE id = $1`, [thread.id]);
      await client.query("COMMIT");
      return { thread, message: mapMessage(m.rows[0]!) };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async addMessage(threadId: string, authorId: string, body: string): Promise<ConnectionMessageView> {
    const result = await this.db.query<{
      id: string;
      thread_id: string;
      author_person_id: string;
      body: string;
      created_at: Date;
    }>(
      `
      INSERT INTO connection_messages (thread_id, author_person_id, body)
      VALUES ($1, $2, $3)
      RETURNING id, thread_id, author_person_id, body, created_at
      `,
      [threadId, authorId, body]
    );
    await this.db.query(`UPDATE connection_threads SET updated_at = now() WHERE id = $1`, [threadId]);
    return mapMessage(result.rows[0]!);
  }

  async listMessages(threadId: string): Promise<ConnectionMessageView[]> {
    const result = await this.db.query<{
      id: string;
      thread_id: string;
      author_person_id: string;
      body: string;
      created_at: Date;
    }>(
      `
      SELECT id, thread_id, author_person_id, body, created_at
      FROM connection_messages
      WHERE thread_id = $1
      ORDER BY created_at ASC, id ASC
      `,
      [threadId]
    );
    return result.rows.map(mapMessage);
  }

  async countMessages(threadId: string): Promise<number> {
    const result = await this.db.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM connection_messages WHERE thread_id = $1`,
      [threadId]
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

  async listThreadsForPerson(personId: string, limit: number): Promise<ConnectionThreadListView[]> {
    const result = await this.db.query<{
      id: string;
      initiator_person_id: string;
      recipient_person_id: string;
      status: ConnectionThreadStatus;
      updated_at: Date;
      counterparty_person_id: string;
      counterparty_full_name: string | null;
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
        t.updated_at,
        CASE
          WHEN t.initiator_person_id = $1 THEN t.recipient_person_id
          ELSE t.initiator_person_id
        END AS counterparty_person_id,
        cp.full_name AS counterparty_full_name,
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
      updatedAt: r.updated_at,
      counterpartyPersonId: r.counterparty_person_id,
      counterpartyFullName: r.counterparty_full_name,
      lastMessageBody: r.last_body,
      lastMessageAuthorPersonId: r.last_author_person_id,
      lastMessageCreatedAt: r.last_created_at
    }));
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
