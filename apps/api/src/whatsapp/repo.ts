import type { DbExecutor } from "../db/types.js";

export interface WaContactRow {
  wa_id: string;
  person_id: string | null;
  linked_at: Date | null;
  last_inbound_at: Date | null;
  notes_opted_in_at: Date | null;
  notes_paused_at: Date | null;
  stopped_at: Date | null;
  state: { step?: string; askDay?: string; askCount?: number };
  /** Joined from people (null when not linked or the account is gone). */
  person_live: boolean | null;
  onboarding_completed_at: Date | null;
  full_name: string | null;
}

/** ready: can link now · linked: just linked · the rest: nothing linked. */
export type LinkStatus = "ready" | "linked" | "already_yours" | "linked_elsewhere" | "you_have_another" | "used";
export type ClaimResult = Exclude<LinkStatus, "ready">;

/** Order of outbound statuses; an update never moves a message backwards. */
const STATUS_RANK = (col: string) =>
  `(CASE ${col} WHEN 'uncertain' THEN 0 WHEN 'accepted' THEN 1 WHEN 'sent' THEN 2 WHEN 'delivered' THEN 3 WHEN 'read' THEN 4 WHEN 'failed' THEN 5 ELSE 1 END)`;

const CONTACT_SELECT = `
  c.*, (p.id IS NOT NULL AND p.deleted_at IS NULL AND p.suspended_at IS NULL) AS person_live,
  p.onboarding_completed_at, p.full_name
  FROM wa_contacts c LEFT JOIN people p ON p.id = c.person_id`;

export class WaRepo {
  constructor(private readonly db: DbExecutor) {}

  /** Idempotency: false when Meta re-delivers a message we already handled. */
  async recordInbound(waMessageId: string, waId: string, kind: string): Promise<boolean> {
    const r = await this.db.query(
      `INSERT INTO wa_messages (wa_message_id, direction, wa_id, kind, status)
       VALUES ($1, 'in', $2, $3, 'received') ON CONFLICT (wa_message_id) DO NOTHING RETURNING id`,
      [waMessageId, waId, kind]
    );
    return (r.rowCount ?? 0) > 0;
  }

  /** Upsert the sender and mark their 24-hour reply window as open now. */
  async touchInbound(waId: string): Promise<WaContactRow> {
    await this.db.query(
      `INSERT INTO wa_contacts (wa_id, last_inbound_at) VALUES ($1, now())
       ON CONFLICT (wa_id) DO UPDATE SET last_inbound_at = now(), updated_at = now()`,
      [waId]
    );
    return (await this.byWaId(waId))!;
  }

  async byWaId(waId: string): Promise<WaContactRow | null> {
    const r = await this.db.query<WaContactRow>(`SELECT ${CONTACT_SELECT} WHERE c.wa_id = $1`, [waId]);
    return r.rows[0] ?? null;
  }

  async byPerson(personId: string): Promise<WaContactRow | null> {
    const r = await this.db.query<WaContactRow>(`SELECT ${CONTACT_SELECT} WHERE c.person_id = $1`, [personId]);
    return r.rows[0] ?? null;
  }

  /**
   * What linking `waId` to `personId` would do. Numbers never move: a linked number stays with its
   * member, and a member keeps their first number (an admin can unlink by hand).
   */
  async linkStatus(waId: string, personId: string, nonce: string): Promise<LinkStatus> {
    const r = await this.db.query<{ owner: string | null; mine: string | null; used: boolean }>(
      `SELECT (SELECT person_id::text FROM wa_contacts WHERE wa_id = $1) AS owner,
              (SELECT wa_id FROM wa_contacts WHERE person_id = $2) AS mine,
              EXISTS (SELECT 1 FROM wa_link_tokens_used WHERE nonce = $3) AS used`,
      [waId, personId, nonce]
    );
    const row = r.rows[0]!;
    if (row.owner === personId) return "already_yours";
    if (row.owner) return "linked_elsewhere";
    if (row.mine) return "you_have_another";
    if (row.used) return "used";
    return "ready";
  }

  /**
   * Link a number once per token. Call inside a transaction: locks the number's row, re-checks,
   * records the token's nonce, and clears any settings the row carried from before.
   */
  async claim(waId: string, personId: string, nonce: string): Promise<ClaimResult> {
    await this.db.query(`INSERT INTO wa_contacts (wa_id) VALUES ($1) ON CONFLICT (wa_id) DO NOTHING`, [waId]);
    await this.db.query(`SELECT wa_id FROM wa_contacts WHERE wa_id = $1 FOR UPDATE`, [waId]);
    const status = await this.linkStatus(waId, personId, nonce);
    if (status !== "ready") return status;
    const used = await this.db.query(
      `INSERT INTO wa_link_tokens_used (nonce, wa_id, person_id) VALUES ($1, $2, $3)
       ON CONFLICT (nonce) DO NOTHING RETURNING nonce`,
      [nonce, waId, personId]
    );
    if ((used.rowCount ?? 0) === 0) return "used";
    // STOP stays: it belongs to whoever holds the phone. Everything else starts fresh.
    await this.db.query(
      `UPDATE wa_contacts
       SET person_id = $2, linked_at = now(), notes_opted_in_at = NULL, notes_paused_at = NULL,
           state = '{}'::jsonb, updated_at = now()
       WHERE wa_id = $1 AND person_id IS NULL`,
      [waId, personId]
    );
    return "linked";
  }

  /** Save a short link (/w/<code>). False when the code is already taken (pick another). */
  async createShortLink(input: { code: string; token: string; next: string | null; expiresAt: Date }): Promise<boolean> {
    const r = await this.db.query(
      `INSERT INTO wa_short_links (code, token, next, expires_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO NOTHING RETURNING code`,
      [input.code, input.token, input.next, input.expiresAt]
    );
    return (r.rowCount ?? 0) > 0;
  }

  /** The signed link and destination behind a short code, while it's still valid. */
  async resolveShortLink(code: string): Promise<{ token: string; next: string | null } | null> {
    const r = await this.db.query<{ token: string; next: string | null }>(
      `SELECT token, next FROM wa_short_links WHERE code = $1 AND expires_at > now()`,
      [code]
    );
    return r.rows[0] ?? null;
  }

  /** Expired short links, and used-link records whose tokens could no longer be valid anyway. */
  async purgeExpiredLinks(): Promise<number> {
    const used = await this.db.query(`DELETE FROM wa_link_tokens_used WHERE used_at < now() - interval '3 days'`);
    const short = await this.db.query(`DELETE FROM wa_short_links WHERE expires_at < now() - interval '1 day'`);
    return (used.rowCount ?? 0) + (short.rowCount ?? 0);
  }

  /** Onboarding test: tag a brand-new member (joined in the last 24 hours) as arriving from WhatsApp. */
  async tagSignupFromWhatsApp(personId: string): Promise<void> {
    await this.db.query(
      `UPDATE people SET signup_channel = 'whatsapp'
       WHERE id = $1 AND signup_channel IS NULL AND created_at >= now() - interval '24 hours'`,
      [personId]
    );
  }

  async setState(waId: string, state: WaContactRow["state"]): Promise<void> {
    await this.db.query(`UPDATE wa_contacts SET state = $2::jsonb, updated_at = now() WHERE wa_id = $1`, [waId, JSON.stringify(state)]);
  }

  async setStopped(waId: string, stopped: boolean): Promise<void> {
    await this.db.query(
      `UPDATE wa_contacts SET stopped_at = ${stopped ? "now()" : "NULL"}, updated_at = now() WHERE wa_id = $1`,
      [waId]
    );
  }

  async setPausedForPerson(personId: string, paused: boolean): Promise<void> {
    await this.db.query(
      `UPDATE wa_contacts SET notes_paused_at = ${paused ? "now()" : "NULL"}, updated_at = now() WHERE person_id = $1`,
      [personId]
    );
  }

  async setOptInForPerson(personId: string, optedIn: boolean): Promise<void> {
    await this.db.query(
      `UPDATE wa_contacts SET notes_opted_in_at = ${optedIn ? "COALESCE(notes_opted_in_at, now())" : "NULL"},
              notes_paused_at = ${optedIn ? "notes_paused_at" : "NULL"}, updated_at = now()
       WHERE person_id = $1`,
      [personId]
    );
  }

  async recordOutbound(input: {
    waMessageId: string | null;
    waId: string;
    kind: string;
    template?: string | null;
    status: "accepted" | "failed" | "uncertain";
    errorCode?: string | null;
    contactRequestId?: string | null;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO wa_messages (wa_message_id, direction, wa_id, kind, template, status, error_code, contact_request_id)
       VALUES ($1, 'out', $2, $3, $4, $5, $6, $7)`,
      [
        input.waMessageId,
        input.waId,
        input.kind,
        input.template ?? null,
        input.status,
        input.errorCode ?? null,
        input.contactRequestId ?? null
      ]
    );
  }

  /**
   * Delivery status webhooks: sent / delivered / read / failed, plus how Meta billed it.
   * Statuses can arrive out of order, so a status only moves forward (failed is final).
   * Returns the note it belongs to, or null when no message matched.
   */
  async updateStatus(input: {
    waMessageId: string;
    status: string;
    pricingCategory: string | null;
    billable: boolean | null;
    errorCode: string | null;
  }): Promise<{ contactRequestId: string | null } | null> {
    const r = await this.db.query<{ contact_request_id: string | null }>(
      `UPDATE wa_messages
       SET status = CASE WHEN ${STATUS_RANK("$2::text")} >= ${STATUS_RANK("status")} THEN $2 ELSE status END,
           pricing_category = COALESCE($3, pricing_category),
           billable = COALESCE($4, billable),
           error_code = COALESCE($5, error_code),
           updated_at = now()
       WHERE wa_message_id = $1 AND direction = 'out'
       RETURNING contact_request_id`,
      [input.waMessageId, input.status, input.pricingCategory, input.billable, input.errorCode]
    );
    return r.rows[0] ? { contactRequestId: r.rows[0].contact_request_id } : null;
  }

  /**
   * A note template whose send timed out (we never got Meta's id): Meta's status update carries
   * our note id, so attach Meta's id to that record. True when one was found.
   */
  async attachUncertainNote(contactRequestId: string, waMessageId: string): Promise<boolean> {
    const r = await this.db.query(
      `UPDATE wa_messages SET wa_message_id = $2, updated_at = now()
       WHERE id = (
         SELECT id FROM wa_messages
         WHERE contact_request_id = $1 AND direction = 'out' AND kind = 'template'
           AND wa_message_id IS NULL AND status = 'uncertain'
         ORDER BY created_at DESC LIMIT 1
       )
       RETURNING id`,
      [contactRequestId, waMessageId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  /**
   * Paid template messages sent this calendar month, for the hard cap. Failed sends are excluded;
   * uncertain ones (no answer from Meta in time) count, since they may have gone out.
   */
  async templatesThisMonth(): Promise<number> {
    const r = await this.db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM wa_messages
       WHERE direction = 'out' AND kind = 'template' AND status <> 'failed'
         AND created_at >= date_trunc('month', now())`
    );
    return Number(r.rows[0]?.c ?? 0);
  }
}
