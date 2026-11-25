import type { DbExecutor } from "../db/types.js";
import { isExperienceBand, isJobFunction, type ExperienceBand, type JobFunction } from "../lib/jobFunctions.js";
import type { NoteDetails } from "../lib/noteDetails.js";
import type { BrokerKind } from "./brokerRepo.js";
import { DOMAIN_DIRECTORY } from "../lib/domainAllowlist.js";

/**
 * Brokered conversations (migration 079): a connection thread of kind 'broker', one per connected
 * request, between the asker (initiator) and the helper who said yes (recipient). Messages live in
 * connection_messages like every other thread; read state in connection_thread_reads.
 */

export interface BrokerThreadRow {
  id: string;
  broker_request_id: string;
  initiator_person_id: string;
  recipient_person_id: string;
  status: "open" | "closed" | "declined";
  closed_by_person_id: string | null;
  closed_at: Date | null;
  created_at: Date;
  /** Newest message time, or null before anyone writes. */
  last_message_at: Date | null;
  message_count: number;
}

export interface BrokerThreadContext {
  kind: BrokerKind;
  company: string;
  jobFunction: JobFunction;
  experienceBand: ExperienceBand | null;
  roleTitle: string | null;
  jobUrl: string | null;
  message: string;
  details: NoteDetails | null;
}

export interface BrokerParticipant {
  personId: string;
  fullName: string | null;
  departmentCode: string | null;
  batchYear: number | null;
  /** Their institute, from the sign-in email domain ("IIT (BHU) Varanasi"). */
  institutionName: string | null;
  /** Deleted or suspended: the conversation turns read-only. */
  unavailable: boolean;
  email: string;
}

export interface BrokerMessageRow {
  id: string;
  authorPersonId: string;
  body: string;
  createdAt: Date;
}

/** One line per conversation for lists (Your requests, Requests for you). */
export interface BrokerConversationSummaryRow {
  requestId: string;
  threadId: string;
  status: BrokerThreadRow["status"];
  closedByPersonId: string | null;
  createdAt: Date;
  lastMessageAt: Date | null;
  messageCount: number;
  unreadCount: number;
  counterpartUnavailable: boolean;
}

/** Conversations where the newest message is from the other person (for notifications). */
export interface BrokerMessageNotificationRow {
  requestId: string;
  requestKind: BrokerKind;
  company: string;
  roleTitle: string | null;
  counterpartPersonId: string;
  counterpartFullName: string | null;
  lastBody: string;
  lastCreatedAt: Date;
  lastReadAt: Date | null;
  unreadCount: number;
}

export interface BrokerConnectedRow {
  requestId: string;
  requestKind: BrokerKind;
  company: string;
  roleTitle: string | null;
  connectedAt: Date;
  helperPersonId: string;
  helperFullName: string | null;
}

const THREAD_COLUMNS = `
  t.id, t.broker_request_id, t.initiator_person_id, t.recipient_person_id, t.status,
  t.closed_by_person_id, t.closed_at, t.created_at,
  (SELECT max(m.created_at) FROM connection_messages m WHERE m.thread_id = t.id) AS last_message_at,
  (SELECT count(*)::int FROM connection_messages m WHERE m.thread_id = t.id) AS message_count`;

export class BrokerConversationRepo {
  constructor(private readonly db: DbExecutor) {}

  /** Opens the conversation for a request that just connected (in the caller's transaction). */
  async create(requestId: string, askerPersonId: string, helperPersonId: string): Promise<string> {
    const r = await this.db.query<{ id: string }>(
      `
      INSERT INTO connection_threads (initiator_person_id, recipient_person_id, status, kind, broker_request_id)
      VALUES ($1, $2, 'open', 'broker', $3)
      ON CONFLICT (broker_request_id) WHERE broker_request_id IS NOT NULL DO UPDATE SET broker_request_id = EXCLUDED.broker_request_id
      RETURNING id
      `,
      [askerPersonId, helperPersonId, requestId]
    );
    return r.rows[0]!.id;
  }

  /** The request's conversation, only when the viewer is one of its two people (otherwise null). */
  async forParticipant(requestId: string, personId: string, lock = false): Promise<BrokerThreadRow | null> {
    const r = await this.db.query<BrokerThreadRow>(
      `
      SELECT ${THREAD_COLUMNS}
      FROM connection_threads t
      WHERE t.broker_request_id = $1
        AND t.kind = 'broker'
        AND (t.initiator_person_id = $2 OR t.recipient_person_id = $2)
      ${lock ? "FOR UPDATE OF t" : ""}
      `,
      [requestId, personId]
    );
    return r.rows[0] ?? null;
  }

  async context(requestId: string): Promise<BrokerThreadContext | null> {
    const r = await this.db.query<{
      kind: BrokerKind;
      company: string;
      job_function: string;
      experience_band: string | null;
      role_title: string | null;
      job_url: string | null;
      message: string;
      details: NoteDetails | null;
    }>(
      `SELECT kind, company, job_function, experience_band, role_title, job_url, message, details FROM broker_requests WHERE id = $1`,
      [requestId]
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      kind: row.kind,
      company: row.company,
      jobFunction: isJobFunction(row.job_function) ? row.job_function : "other",
      experienceBand: isExperienceBand(row.experience_band) ? row.experience_band : null,
      roleTitle: row.role_title,
      jobUrl: row.job_url,
      message: row.message,
      details: row.details
    };
  }

  /** Name, department and year for the header and the profile link. Never a phone or personal email. */
  async participant(personId: string): Promise<BrokerParticipant | null> {
    const r = await this.db.query<{
      id: string;
      full_name: string | null;
      department_code: string | null;
      batch_year: number | null;
      unavailable: boolean;
      institutional_email: string;
    }>(
      `
      SELECT p.id, p.full_name, d.code AS department_code, COALESCE(p.batch_year, p.joining_year) AS batch_year,
        (p.deleted_at IS NOT NULL OR p.suspended_at IS NOT NULL) AS unavailable,
        p.institutional_email::text AS institutional_email
      FROM people p LEFT JOIN departments d ON d.id = p.department_id
      WHERE p.id = $1
      `,
      [personId]
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      personId: row.id,
      fullName: row.full_name,
      departmentCode: row.department_code && row.department_code.toLowerCase() !== "other" ? row.department_code : null,
      batchYear: row.batch_year,
      institutionName: DOMAIN_DIRECTORY[row.institutional_email.split("@")[1]?.toLowerCase() ?? ""]?.institution ?? null,
      unavailable: row.unavailable,
      email: row.institutional_email
    };
  }

  async messages(threadId: string): Promise<BrokerMessageRow[]> {
    const r = await this.db.query<{ id: string; author_person_id: string; body: string; created_at: Date }>(
      `SELECT id, author_person_id, body, created_at FROM connection_messages WHERE thread_id = $1 ORDER BY created_at ASC, id ASC`,
      [threadId]
    );
    return r.rows.map((row) => ({ id: row.id, authorPersonId: row.author_person_id, body: row.body, createdAt: row.created_at }));
  }

  /** The newest few authors, newest first (for the unanswered-messages limit). */
  async latestAuthors(threadId: string, limit: number): Promise<string[]> {
    const r = await this.db.query<{ author_person_id: string }>(
      `SELECT author_person_id FROM connection_messages WHERE thread_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
      [threadId, limit]
    );
    return r.rows.map((row) => row.author_person_id);
  }

  /** Messages this member sent in any brokered conversation since the window opened (rate limit). */
  async sentSince(personId: string, since: Date): Promise<{ count: number; oldest: Date | null }> {
    const r = await this.db.query<{ n: number; oldest: Date | null }>(
      `
      SELECT count(*)::int AS n, min(m.created_at) AS oldest
      FROM connection_messages m JOIN connection_threads t ON t.id = m.thread_id
      WHERE m.author_person_id = $1 AND t.kind = 'broker' AND m.created_at > $2
      `,
      [personId, since]
    );
    return { count: Number(r.rows[0]?.n ?? 0), oldest: r.rows[0]?.oldest ?? null };
  }

  async addMessage(threadId: string, authorPersonId: string, body: string): Promise<BrokerMessageRow> {
    const r = await this.db.query<{ id: string; author_person_id: string; body: string; created_at: Date }>(
      `
      INSERT INTO connection_messages (thread_id, author_person_id, body, created_at)
      VALUES ($1, $2, $3, clock_timestamp())
      RETURNING id, author_person_id, body, created_at
      `,
      [threadId, authorPersonId, body]
    );
    await this.db.query(`UPDATE connection_threads SET updated_at = now() WHERE id = $1`, [threadId]);
    const row = r.rows[0]!;
    return { id: row.id, authorPersonId: row.author_person_id, body: row.body, createdAt: row.created_at };
  }

  /** Unread messages from the other person (everything they wrote after this person last read). */
  async unreadFor(threadId: string, personId: string): Promise<number> {
    const r = await this.db.query<{ n: number }>(
      `
      SELECT count(*)::int AS n
      FROM connection_messages m
      LEFT JOIN connection_thread_reads rd ON rd.thread_id = m.thread_id AND rd.person_id = $2
      WHERE m.thread_id = $1 AND m.author_person_id <> $2 AND (rd.last_read_at IS NULL OR m.created_at > rd.last_read_at)
      `,
      [threadId, personId]
    );
    return Number(r.rows[0]?.n ?? 0);
  }

  /** Read up to now (never moves backwards). */
  async markRead(threadId: string, personId: string): Promise<void> {
    await this.db.query(
      `
      INSERT INTO connection_thread_reads (thread_id, person_id, last_read_at) VALUES ($1, $2, clock_timestamp())
      ON CONFLICT (thread_id, person_id) DO UPDATE SET last_read_at = GREATEST(connection_thread_reads.last_read_at, EXCLUDED.last_read_at)
      `,
      [threadId, personId]
    );
  }

  async close(threadId: string, personId: string): Promise<boolean> {
    const r = await this.db.query(
      `UPDATE connection_threads SET status = 'closed', closed_by_person_id = $2, closed_at = now() WHERE id = $1 AND status = 'open'`,
      [threadId, personId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  /** The viewer's conversations for these requests, keyed by request id. */
  async summaries(personId: string, requestIds: string[]): Promise<Map<string, BrokerConversationSummaryRow>> {
    if (requestIds.length === 0) return new Map();
    const r = await this.db.query<{
      request_id: string;
      thread_id: string;
      status: BrokerThreadRow["status"];
      closed_by_person_id: string | null;
      created_at: Date;
      last_message_at: Date | null;
      message_count: number;
      unread_count: number;
      counterpart_unavailable: boolean;
    }>(
      `
      SELECT t.broker_request_id AS request_id, t.id AS thread_id, t.status, t.closed_by_person_id, t.created_at,
        (SELECT max(m.created_at) FROM connection_messages m WHERE m.thread_id = t.id) AS last_message_at,
        (SELECT count(*)::int FROM connection_messages m WHERE m.thread_id = t.id) AS message_count,
        (
          SELECT count(*)::int FROM connection_messages m
          WHERE m.thread_id = t.id AND m.author_person_id <> $1 AND (rd.last_read_at IS NULL OR m.created_at > rd.last_read_at)
        ) AS unread_count,
        (cp.deleted_at IS NOT NULL OR cp.suspended_at IS NOT NULL) AS counterpart_unavailable
      FROM connection_threads t
      JOIN people cp ON cp.id = CASE WHEN t.initiator_person_id = $1 THEN t.recipient_person_id ELSE t.initiator_person_id END
      LEFT JOIN connection_thread_reads rd ON rd.thread_id = t.id AND rd.person_id = $1
      WHERE t.kind = 'broker'
        AND t.broker_request_id = ANY($2::uuid[])
        AND (t.initiator_person_id = $1 OR t.recipient_person_id = $1)
      `,
      [personId, requestIds]
    );
    return new Map(
      r.rows.map((row) => [
        row.request_id,
        {
          requestId: row.request_id,
          threadId: row.thread_id,
          status: row.status,
          closedByPersonId: row.closed_by_person_id,
          createdAt: row.created_at,
          lastMessageAt: row.last_message_at,
          messageCount: Number(row.message_count),
          unreadCount: Number(row.unread_count),
          counterpartUnavailable: row.counterpart_unavailable
        }
      ])
    );
  }

  /** Conversations whose newest message came from the other person, newest first. */
  async messageNotifications(personId: string, limit: number): Promise<BrokerMessageNotificationRow[]> {
    const r = await this.db.query<{
      request_id: string;
      request_kind: BrokerKind;
      company: string;
      role_title: string | null;
      counterpart_person_id: string;
      counterpart_full_name: string | null;
      last_body: string;
      last_created_at: Date;
      last_read_at: Date | null;
      unread_count: number;
    }>(
      `
      WITH mine AS (
        SELECT t.id, t.broker_request_id,
          CASE WHEN t.initiator_person_id = $1 THEN t.recipient_person_id ELSE t.initiator_person_id END AS counterpart_id
        FROM connection_threads t
        WHERE t.kind = 'broker' AND (t.initiator_person_id = $1 OR t.recipient_person_id = $1)
      ), last_msg AS (
        SELECT DISTINCT ON (m.thread_id) m.thread_id, m.author_person_id, m.body, m.created_at
        FROM connection_messages m JOIN mine ON mine.id = m.thread_id
        ORDER BY m.thread_id, m.created_at DESC, m.id DESC
      )
      SELECT mine.broker_request_id AS request_id, br.kind AS request_kind, br.company, br.role_title,
        mine.counterpart_id AS counterpart_person_id, cp.full_name AS counterpart_full_name,
        lm.body AS last_body, lm.created_at AS last_created_at, rd.last_read_at,
        (
          SELECT count(*)::int FROM connection_messages m
          WHERE m.thread_id = mine.id AND m.author_person_id <> $1 AND (rd.last_read_at IS NULL OR m.created_at > rd.last_read_at)
        ) AS unread_count
      FROM mine
      JOIN last_msg lm ON lm.thread_id = mine.id
      JOIN broker_requests br ON br.id = mine.broker_request_id
      JOIN people cp ON cp.id = mine.counterpart_id
      LEFT JOIN connection_thread_reads rd ON rd.thread_id = mine.id AND rd.person_id = $1
      WHERE lm.author_person_id <> $1
      ORDER BY lm.created_at DESC
      LIMIT $2
      `,
      [personId, limit]
    );
    return r.rows.map((row) => ({
      requestId: row.request_id,
      requestKind: row.request_kind,
      company: row.company,
      roleTitle: row.role_title,
      counterpartPersonId: row.counterpart_person_id,
      counterpartFullName: row.counterpart_full_name,
      lastBody: row.last_body,
      lastCreatedAt: row.last_created_at,
      lastReadAt: row.last_read_at,
      unreadCount: Number(row.unread_count)
    }));
  }

  /** The asker's requests where someone said yes (the "you're connected" notification). */
  async connectedForAsker(askerPersonId: string, limit: number): Promise<BrokerConnectedRow[]> {
    const r = await this.db.query<{
      request_id: string;
      kind: BrokerKind;
      company: string;
      role_title: string | null;
      connected_at: Date;
      helper_person_id: string;
      helper_full_name: string | null;
    }>(
      `
      SELECT br.id AS request_id, br.kind, br.company, br.role_title, br.connected_at,
        ba.helper_person_id, hp.full_name AS helper_full_name
      FROM broker_requests br
      JOIN broker_asks ba ON ba.request_id = br.id AND ba.status = 'accepted'
      JOIN people hp ON hp.id = ba.helper_person_id
      WHERE br.asker_person_id = $1 AND br.status = 'connected'
      ORDER BY br.connected_at DESC
      LIMIT $2
      `,
      [askerPersonId, limit]
    );
    return r.rows.map((row) => ({
      requestId: row.request_id,
      requestKind: row.kind,
      company: row.company,
      roleTitle: row.role_title,
      connectedAt: row.connected_at,
      helperPersonId: row.helper_person_id,
      helperFullName: row.helper_full_name
    }));
  }

  async countConnectedForAsker(askerPersonId: string): Promise<number> {
    const r = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM broker_requests WHERE asker_person_id = $1 AND status = 'connected'`,
      [askerPersonId]
    );
    return Number(r.rows[0]?.n ?? 0);
  }

  async countMessageNotifications(personId: string): Promise<number> {
    const r = await this.db.query<{ n: number }>(
      `
      WITH last_msg AS (
        SELECT DISTINCT ON (m.thread_id) m.thread_id, m.author_person_id
        FROM connection_messages m JOIN connection_threads t ON t.id = m.thread_id
        WHERE t.kind = 'broker' AND (t.initiator_person_id = $1 OR t.recipient_person_id = $1)
        ORDER BY m.thread_id, m.created_at DESC, m.id DESC
      )
      SELECT count(*)::int AS n FROM last_msg WHERE author_person_id <> $1
      `,
      [personId]
    );
    return Number(r.rows[0]?.n ?? 0);
  }
}
