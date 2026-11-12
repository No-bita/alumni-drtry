import type { Pool, PoolClient } from "pg";
import { env } from "../config/env.js";
import { createUnsubscribeToken } from "../lib/announcementUnsubscribe.js";
import { personIsProductionAlumniSql } from "../lib/demoPersonSql.js";
import { AppError } from "../lib/errors.js";
import { apiPublicBaseUrl, webAppUrl } from "../lib/webAppUrl.js";
import { maskEmail } from "../repos/organizationRepo.js";
import { EmailDeliveryUnconfirmedError, type EmailSender } from "./emailSender.js";

export type AnnouncementChannels = "in_app" | "email" | "both";

/** Who gets it: AND across the three filters, OR within each. Empty or missing = no filter. */
export interface AnnouncementFilters {
  batchYears?: number[];
  departmentCodes?: string[];
  placeIds?: string[];
}

export interface AnnouncementInput {
  title: string;
  body: string;
  linkPath: string | null;
  channels: AnnouncementChannels;
}

export interface AudiencePreview {
  count: number;
  sample: Array<{ personId: string; fullName: string | null; batchYear: number | null; departmentCode: string | null }>;
}

export interface AnnouncementSummary {
  id: string;
  title: string;
  channels: AnnouncementChannels;
  status: string;
  isTest: boolean;
  recipientCount: number;
  createdAt: string;
  completedAt: string | null;
  sender: { personId: string | null; name: string | null };
  filters: StoredFilters;
  email: { queued: number; sent: number; failed: number; skippedOptedOut: number };
}

export interface AnnouncementDetail extends AnnouncementSummary {
  body: string;
  linkPath: string | null;
  inApp: { delivered: number; seen: number };
}

/** In-app notification rows for one member. */
export interface AnnouncementNotificationRow {
  id: string;
  title: string;
  body: string;
  linkPath: string | null;
  occurredAt: Date;
}

interface StoredFilters {
  batchYears: number[];
  departmentCodes: string[];
  places: Array<{ id: string; label: string }>;
}

export const ANNOUNCEMENT_SAMPLE_SIZE = 5;
export const ANNOUNCEMENT_EMAIL_BATCH = 50;
/** Retries for clear provider rejections; an unanswered send is never retried (it may have gone out). */
export const ANNOUNCEMENT_EMAIL_MAX_ATTEMPTS = 3;
/** A claim older than this means the process stopped mid-send: marked failed, never re-sent. */
export const ANNOUNCEMENT_STALE_CLAIM_MINUTES = 10;

export type SendResult = { kind: "sent"; announcement: AnnouncementDetail } | { kind: "count_changed"; count: number };

export interface AnnouncementServiceOptions {
  emailsPerSecond?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Start the email worker right after a send (off in tests, which drive the worker directly). */
  autoStartWorker?: boolean;
  log?: (msg: string, err?: unknown) => void;
}

const nonEmpty = <T>(xs: T[] | undefined): T[] | null => (xs && xs.length > 0 ? xs : null);

/** Admin-only: "/app/x" and "x" both become "/x" (the web base already ends in /app). */
export function normalizeLinkPath(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  let p = raw.trim();
  if (!p) return null;
  if (p === "/app" || p.startsWith("/app/") || p.startsWith("/app?") || p.startsWith("/app#")) p = p.slice(4) || "/";
  if (!p.startsWith("/")) p = `/${p}`;
  return p;
}

/** In-app path only: no scheme, host, protocol-relative "//", backslashes or control characters. */
export function isSafeLinkPath(p: string): boolean {
  if (p.length > 300) return false;
  if (!p.startsWith("/") || p.startsWith("//")) return false;
  if (/[\\\s\u0000-\u001F\u007F]/.test(p)) return false;
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(p)) return false;
  return /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#]*$/.test(p);
}

export class AnnouncementService {
  private running = false;
  private readonly perSecond: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly autoStartWorker: boolean;
  private readonly log: (msg: string, err?: unknown) => void;

  constructor(
    private readonly pool: Pool,
    private readonly emailSender: EmailSender,
    options: AnnouncementServiceOptions = {}
  ) {
    this.perSecond = options.emailsPerSecond ?? env.ANNOUNCEMENT_EMAILS_PER_SECOND;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.autoStartWorker = options.autoStartWorker ?? env.NODE_ENV !== "test";
    this.log = options.log ?? ((msg, err) => console.error(`[announcements] ${msg}`, err ?? ""));
  }

  /* ------------------------------------------------------------------ */
  /* Audience                                                            */
  /* ------------------------------------------------------------------ */

  /** WHERE clause for members matching the filters ($1 batch years, $2 department codes, $3 place ids). */
  private audienceWhere(): string {
    return `
      p.deleted_at IS NULL
      AND p.suspended_at IS NULL
      AND ${personIsProductionAlumniSql("p")}
      AND ($1::int[] IS NULL OR p.batch_year = ANY($1::int[]))
      AND ($2::text[] IS NULL OR d.code = ANY($2::text[]))
      AND ($3::uuid[] IS NULL OR EXISTS (
        SELECT 1 FROM canonical_places cp
        WHERE cp.id = p.residence_canonical_place_id AND cp.id = ANY($3::uuid[]) AND cp.status = 'approved'
      ))`;
  }

  private audienceParams(f: AnnouncementFilters): unknown[] {
    return [nonEmpty(f.batchYears), nonEmpty(f.departmentCodes), nonEmpty(f.placeIds)];
  }

  async preview(filters: AnnouncementFilters, db: Pool | PoolClient = this.pool): Promise<AudiencePreview> {
    const params = this.audienceParams(filters);
    const [count, sample] = await Promise.all([
      db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM people p LEFT JOIN departments d ON d.id = p.department_id WHERE ${this.audienceWhere()}`,
        params
      ),
      db.query<{ id: string; full_name: string | null; batch_year: number | null; code: string | null }>(
        `SELECT p.id, p.full_name, p.batch_year, d.code
         FROM people p LEFT JOIN departments d ON d.id = p.department_id
         WHERE ${this.audienceWhere()}
         ORDER BY p.full_name NULLS LAST, p.id
         LIMIT ${ANNOUNCEMENT_SAMPLE_SIZE}`,
        params
      )
    ]);
    return {
      count: count.rows[0]?.n ?? 0,
      sample: sample.rows.map((r) => ({
        personId: r.id,
        fullName: r.full_name,
        batchYear: r.batch_year,
        departmentCode: r.code
      }))
    };
  }

  /** Only approved cities can be targeted; unknown or non-approved ids are refused. */
  private async storedFilters(f: AnnouncementFilters, db: Pool | PoolClient): Promise<StoredFilters> {
    const placeIds = nonEmpty(f.placeIds) ?? [];
    let places: Array<{ id: string; label: string }> = [];
    if (placeIds.length > 0) {
      const r = await db.query<{ id: string; city_label: string; country: string }>(
        `SELECT id, city_label, country FROM canonical_places WHERE id = ANY($1::uuid[]) AND status = 'approved'`,
        [placeIds]
      );
      if (r.rows.length !== new Set(placeIds).size) {
        throw new AppError(400, "ANNOUNCEMENT_BAD_CITY", "Only approved cities can be chosen.");
      }
      places = r.rows.map((p) => ({ id: p.id, label: `${p.city_label}, ${p.country}` }));
    }
    return {
      batchYears: [...new Set(nonEmpty(f.batchYears) ?? [])].sort((a, b) => a - b),
      departmentCodes: [...new Set(nonEmpty(f.departmentCodes) ?? [])],
      places
    };
  }

  /* ------------------------------------------------------------------ */
  /* Sending                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * Send to everyone matching the filters. The audience is re-counted inside the transaction: if it
   * no longer equals what the admin confirmed, nothing is sent and the new count comes back.
   */
  async send(
    adminPersonId: string,
    input: AnnouncementInput,
    filters: AnnouncementFilters,
    confirmCount: number
  ): Promise<SendResult> {
    let id: string;
    try {
      id = await this.tx(async (client) => {
        const stored = await this.storedFilters(filters, client);
        const announcementId = await this.insertAnnouncement(client, adminPersonId, input, stored, false, 0);
        // The snapshot itself is the count: whoever is inserted here is exactly who gets it.
        const inserted = await client.query(
          `INSERT INTO announcement_recipients (announcement_id, person_id, in_app)
           SELECT $4::uuid, p.id, $5::boolean
           FROM people p LEFT JOIN departments d ON d.id = p.department_id
           WHERE ${this.audienceWhere()}
           ON CONFLICT DO NOTHING`,
          [...this.audienceParams(filters), announcementId, input.channels !== "email"]
        );
        const count = inserted.rowCount ?? 0;
        if (count !== confirmCount) throw new CountChanged(count);
        if (count === 0) throw new AppError(400, "ANNOUNCEMENT_NO_RECIPIENTS", "No members match these filters.");
        await client.query(`UPDATE announcements SET recipient_count = $2 WHERE id = $1`, [announcementId, count]);
        if (input.channels !== "in_app") await this.queueEmails(client, announcementId, false);
        return announcementId;
      });
    } catch (err) {
      if (err instanceof CountChanged) return { kind: "count_changed", count: err.count };
      throw err;
    }
    this.kickWorker(input.channels);
    return { kind: "sent", announcement: (await this.detail(id))! };
  }

  /** A test goes to the sending admin only (both their addresses for email), flagged as a test in history. */
  async sendTest(adminPersonId: string, input: AnnouncementInput): Promise<AnnouncementDetail> {
    const id = await this.tx(async (client) => {
      const id = await this.insertAnnouncement(
        client,
        adminPersonId,
        input,
        { batchYears: [], departmentCodes: [], places: [] },
        true,
        1
      );
      await client.query(
        `INSERT INTO announcement_recipients (announcement_id, person_id, in_app) VALUES ($1, $2, $3)`,
        [id, adminPersonId, input.channels !== "email"]
      );
      if (input.channels !== "in_app") await this.queueEmails(client, id, true);
      return id;
    });
    this.kickWorker(input.channels);
    return (await this.detail(id))!;
  }

  private async insertAnnouncement(
    client: PoolClient,
    adminPersonId: string,
    input: AnnouncementInput,
    filters: StoredFilters,
    isTest: boolean,
    recipientCount: number
  ): Promise<string> {
    const inAppOnly = input.channels === "in_app";
    const r = await client.query<{ id: string }>(
      `INSERT INTO announcements
         (title, body, link_path, channels, filters, status, is_test, created_by_person_id, recipient_count, sent_at, completed_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, now(), CASE WHEN $10::boolean THEN now() END)
       RETURNING id`,
      [
        input.title.trim(),
        input.body.trim(),
        input.linkPath,
        input.channels,
        JSON.stringify(filters),
        inAppOnly ? "sent" : "sending",
        isTest,
        adminPersonId,
        recipientCount,
        inAppOnly
      ]
    );
    return r.rows[0]!.id;
  }

  /**
   * One delivery per address: institutional and personal, de-duplicated (the same address once).
   * Opted-out members are recorded as skipped (a test to yourself ignores your own opt-out).
   */
  private async queueEmails(client: PoolClient, announcementId: string, isTest: boolean): Promise<void> {
    await client.query(
      `INSERT INTO announcement_email_deliveries (announcement_id, person_id, address, address_kind, status)
       SELECT $1::uuid, x.person_id, x.address, x.kind,
              CASE WHEN x.opt_out AND NOT $2::boolean THEN 'skipped_opted_out' ELSE 'queued' END
       FROM (
         SELECT p.id AS person_id, p.institutional_email::citext AS address, 'institutional' AS kind,
                p.announcement_emails_opt_out AS opt_out, 1 AS ord
         FROM announcement_recipients r JOIN people p ON p.id = r.person_id
         WHERE r.announcement_id = $1::uuid
         UNION ALL
         SELECT p.id, btrim(p.personal_email::text)::citext, 'personal', p.announcement_emails_opt_out, 2
         FROM announcement_recipients r JOIN people p ON p.id = r.person_id
         WHERE r.announcement_id = $1::uuid AND p.personal_email IS NOT NULL AND btrim(p.personal_email::text) <> ''
         ORDER BY ord, person_id
       ) x
       ON CONFLICT (announcement_id, address) DO NOTHING`,
      [announcementId, isTest]
    );
  }

  private kickWorker(channels: AnnouncementChannels): void {
    if (channels === "in_app" || !this.autoStartWorker) return;
    void this.processEmailQueue().catch((err) => this.log("email worker failed", err));
  }

  /**
   * Send queued announcement emails, throttled. Claims rows atomically (FOR UPDATE SKIP LOCKED), so
   * several workers or replicas never send the same row. A claim left behind by a stopped process is
   * marked failed rather than re-sent: an email that may have gone out is never sent twice.
   */
  async processEmailQueue(maxBatches = 20): Promise<{ sent: number; failed: number; skipped: number; retried: number }> {
    const totals = { sent: 0, failed: 0, skipped: 0, retried: 0 };
    if (this.running) return totals;
    this.running = true;
    try {
      await this.pool.query(
        `UPDATE announcement_email_deliveries
         SET status = 'failed', attempted_at = now(),
             error = 'Stopped while sending; not retried so it is never sent twice.'
         WHERE status = 'sending' AND claimed_at < now() - make_interval(mins => $1)`,
        [ANNOUNCEMENT_STALE_CLAIM_MINUTES]
      );
      const gapMs = Math.ceil(1000 / this.perSecond);
      let first = true;
      for (let batch = 0; batch < maxBatches; batch += 1) {
        const claimed = await this.claimBatch(ANNOUNCEMENT_EMAIL_BATCH);
        if (claimed.length === 0) break;
        for (const row of claimed) {
          if (row.opt_out && !row.is_test) {
            await this.markDelivery(row.id, "skipped_opted_out", null);
            totals.skipped += 1;
            continue;
          }
          if (!first) await this.sleep(gapMs);
          first = false;
          const token = createUnsubscribeToken(row.person_id);
          try {
            await this.emailSender.sendAnnouncementEmail({
              to: row.address,
              title: row.title,
              body: row.body,
              linkUrl: row.link_path ? `${webAppUrl()}${row.link_path}` : null,
              unsubscribeUrl: `${webAppUrl()}/unsubscribe?token=${encodeURIComponent(token)}`,
              oneClickUnsubscribeUrl: `${apiPublicBaseUrl()}/v1/announcements/unsubscribe?token=${encodeURIComponent(token)}`
            });
            await this.markDelivery(row.id, "sent", null);
            totals.sent += 1;
          } catch (err) {
            const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
            const retry = !(err instanceof EmailDeliveryUnconfirmedError) && row.attempts < ANNOUNCEMENT_EMAIL_MAX_ATTEMPTS;
            await this.markDelivery(row.id, retry ? "queued" : "failed", message);
            if (retry) totals.retried += 1;
            else totals.failed += 1;
          }
        }
      }
      await this.finalizeAnnouncements();
      return totals;
    } finally {
      this.running = false;
    }
  }

  private async claimBatch(limit: number) {
    const r = await this.pool.query<{
      id: string;
      person_id: string;
      address: string;
      attempts: number;
      title: string;
      body: string;
      link_path: string | null;
      is_test: boolean;
      opt_out: boolean;
    }>(
      `WITH claimed AS (
         UPDATE announcement_email_deliveries d
         SET status = 'sending', claimed_at = now(), attempts = d.attempts + 1
         FROM (
           SELECT id FROM announcement_email_deliveries
           WHERE status = 'queued'
           ORDER BY created_at, id
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         ) c
         WHERE d.id = c.id
         RETURNING d.id, d.person_id, d.address::text AS address, d.attempts, d.announcement_id
       )
       SELECT c.id, c.person_id, c.address, c.attempts, a.title, a.body, a.link_path, a.is_test,
              p.announcement_emails_opt_out AS opt_out
       FROM claimed c
       JOIN announcements a ON a.id = c.announcement_id
       JOIN people p ON p.id = c.person_id
       ORDER BY c.id`,
      [limit]
    );
    return r.rows;
  }

  private async markDelivery(id: string, status: "sent" | "failed" | "queued" | "skipped_opted_out", error: string | null) {
    await this.pool.query(
      `UPDATE announcement_email_deliveries
       SET status = $2, error = $3, attempted_at = now(),
           sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END,
           claimed_at = CASE WHEN $2 = 'queued' THEN NULL ELSE claimed_at END
       WHERE id = $1`,
      [id, status, error]
    );
  }

  /** An announcement is done once nothing is queued or being sent: sent, or partially failed. */
  private async finalizeAnnouncements(): Promise<void> {
    await this.pool.query(
      `UPDATE announcements a
       SET status = CASE WHEN EXISTS (
             SELECT 1 FROM announcement_email_deliveries d WHERE d.announcement_id = a.id AND d.status = 'failed'
           ) THEN 'partially_failed' ELSE 'sent' END,
           completed_at = now()
       WHERE a.status = 'sending'
         AND NOT EXISTS (
           SELECT 1 FROM announcement_email_deliveries d
           WHERE d.announcement_id = a.id AND d.status IN ('queued', 'sending')
         )`
    );
  }

  /* ------------------------------------------------------------------ */
  /* History                                                             */
  /* ------------------------------------------------------------------ */

  private selectSummary(where: string): string {
    return `
      SELECT a.id, a.title, a.body, a.link_path, a.channels, a.status, a.is_test, a.recipient_count, a.filters,
             a.created_at, a.completed_at, COALESCE(a.sent_at, a.created_at) AS sent_at,
             a.created_by_person_id, s.full_name AS sender_name, s.institutional_email::text AS sender_email,
             COALESCE(e.queued, 0) AS queued, COALESCE(e.sent, 0) AS sent, COALESCE(e.failed, 0) AS failed,
             COALESCE(e.skipped, 0) AS skipped
      FROM announcements a
      LEFT JOIN people s ON s.id = a.created_by_person_id
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE d.status IN ('queued', 'sending'))::int AS queued,
               count(*) FILTER (WHERE d.status = 'sent')::int AS sent,
               count(*) FILTER (WHERE d.status = 'failed')::int AS failed,
               count(*) FILTER (WHERE d.status = 'skipped_opted_out')::int AS skipped
        FROM announcement_email_deliveries d WHERE d.announcement_id = a.id
      ) e ON TRUE
      ${where}`;
  }

  private toSummary(r: SummaryRow): AnnouncementSummary {
    return {
      id: r.id,
      title: r.title,
      channels: r.channels,
      status: r.status,
      isTest: r.is_test,
      recipientCount: r.recipient_count,
      createdAt: r.created_at.toISOString(),
      completedAt: r.completed_at ? r.completed_at.toISOString() : null,
      sender: {
        personId: r.created_by_person_id,
        name: r.sender_name?.trim() || maskEmail(r.sender_email) || null
      },
      filters: {
        batchYears: r.filters?.batchYears ?? [],
        departmentCodes: r.filters?.departmentCodes ?? [],
        places: r.filters?.places ?? []
      },
      email: { queued: r.queued, sent: r.sent, failed: r.failed, skippedOptedOut: r.skipped }
    };
  }

  async list(limit = 50): Promise<AnnouncementSummary[]> {
    const r = await this.pool.query<SummaryRow>(
      `${this.selectSummary("")} ORDER BY a.created_at DESC, a.id DESC LIMIT $1`,
      [Math.min(Math.max(limit, 1), 200)]
    );
    return r.rows.map((row) => this.toSummary(row));
  }

  /** Detail with in-app reach: delivered, and seen (the member's notifications were opened since). */
  async detail(id: string): Promise<AnnouncementDetail | null> {
    const r = await this.pool.query<SummaryRow>(`${this.selectSummary("WHERE a.id = $1")}`, [id]);
    const row = r.rows[0];
    if (!row) return null;
    const inApp = await this.pool.query<{ delivered: number; seen: number }>(
      `SELECT count(*) FILTER (WHERE r.in_app)::int AS delivered,
              count(*) FILTER (WHERE r.in_app AND s.seen_watermark >= $2)::int AS seen
       FROM announcement_recipients r
       LEFT JOIN person_notification_state s ON s.person_id = r.person_id
       WHERE r.announcement_id = $1`,
      [id, row.sent_at]
    );
    return {
      ...this.toSummary(row),
      body: row.body,
      linkPath: row.link_path,
      inApp: { delivered: inApp.rows[0]?.delivered ?? 0, seen: inApp.rows[0]?.seen ?? 0 }
    };
  }

  /* ------------------------------------------------------------------ */
  /* In-app and unsubscribe                                              */
  /* ------------------------------------------------------------------ */

  async notificationsForPerson(personId: string, limit = 50): Promise<AnnouncementNotificationRow[]> {
    const r = await this.pool.query<{ id: string; title: string; body: string; link_path: string | null; at: Date }>(
      `SELECT a.id, a.title, a.body, a.link_path, COALESCE(a.sent_at, a.created_at) AS at
       FROM announcement_recipients r
       JOIN announcements a ON a.id = r.announcement_id
       WHERE r.person_id = $1 AND r.in_app
       ORDER BY at DESC, a.id DESC
       LIMIT $2`,
      [personId, limit]
    );
    return r.rows.map((x) => ({ id: x.id, title: x.title, body: x.body, linkPath: x.link_path, occurredAt: x.at }));
  }

  async countNotificationsForPerson(personId: string): Promise<number> {
    const r = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM announcement_recipients WHERE person_id = $1 AND in_app`,
      [personId]
    );
    return r.rows[0]?.n ?? 0;
  }

  /** Turn announcement emails off or on. False when the person no longer exists. */
  async setEmailOptOut(personId: string, optOut: boolean): Promise<boolean> {
    const r = await this.pool.query(
      `UPDATE people
       SET announcement_emails_opt_out = $2,
           announcement_emails_opt_out_at = CASE WHEN $2 THEN now() ELSE NULL END
       WHERE id = $1 AND deleted_at IS NULL`,
      [personId, optOut]
    );
    return (r.rowCount ?? 0) > 0;
  }

  private async tx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const out = await work(client);
      await client.query("COMMIT");
      return out;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

/** Internal: rolls the send back when the audience no longer matches the confirmed count. */
class CountChanged extends Error {
  constructor(readonly count: number) {
    super("Audience count changed.");
  }
}

interface SummaryRow {
  id: string;
  title: string;
  body: string;
  link_path: string | null;
  channels: AnnouncementChannels;
  status: string;
  is_test: boolean;
  recipient_count: number;
  filters: Partial<StoredFilters> | null;
  created_at: Date;
  completed_at: Date | null;
  sent_at: Date;
  created_by_person_id: string | null;
  sender_name: string | null;
  sender_email: string | null;
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
}
