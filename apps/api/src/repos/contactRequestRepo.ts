import type { DbExecutor } from "../db/types.js";

export type ContactRequestStatus = "pending" | "accepted" | "declined";

interface ContactRequestRow {
  id: string;
  sender_person_id: string;
  recipient_person_id: string;
  message: string;
  status: ContactRequestStatus;
  recipient_contact_shared: string | null;
  forwarded_to_institutional_email: string;
  responded_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface ContactRequestWithPeopleRow extends ContactRequestRow {
  sender_full_name: string | null;
  sender_institutional_email: string;
  recipient_full_name: string | null;
  recipient_institutional_email: string;
  recipient_personal_email: string | null;
}

export interface ContactRequestWithPeopleView {
  id: string;
  senderPersonId: string;
  senderFullName: string | null;
  senderInstitutionalEmail: string;
  recipientPersonId: string;
  recipientFullName: string | null;
  recipientInstitutionalEmail: string;
  recipientPersonalEmail: string | null;
  message: string;
  status: ContactRequestStatus;
  recipientContactShared: string | null;
  forwardedToInstitutionalEmail: string;
  respondedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactRequestView {
  id: string;
  senderPersonId: string;
  recipientPersonId: string;
  message: string;
  status: ContactRequestStatus;
  recipientContactShared: string | null;
  forwardedToInstitutionalEmail: string;
  respondedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ContactRequestSource = "match" | "whatsapp" | "careers" | "cities";

export interface CreateContactRequestInput {
  senderPersonId: string;
  recipientPersonId: string;
  message: string;
  forwardedToInstitutionalEmail: string;
  source?: ContactRequestSource | null;
  sourceCategory?: string | null;
  sourceRank?: number | null;
  /** Cities v1: the offer a newcomer's note answers. */
  cityHelpOfferId?: string | null;
}

/** A note the viewer sent (GET /v1/contact-requests/sent). */
export interface ContactRequestSentView {
  id: string;
  recipientPersonId: string;
  recipientFullName: string | null;
  message: string;
  status: ContactRequestStatus;
  /** Only set once the recipient accepted. */
  recipientContactShared: string | null;
  createdAt: Date;
  respondedAt: Date | null;
}

/** Pending note due for its single reminder email. */
export interface ContactRequestReminderDueView {
  id: string;
  recipientInstitutionalEmail: string;
  recipientFullName: string | null;
  senderFullName: string | null;
  senderInstitutionalEmail: string;
  message: string;
  createdAt: Date;
}

/** Reply record for one recipient over the stats window. */
export interface RecipientReplyStatsRow {
  recipientPersonId: string;
  considered: number;
  replied: number;
  medianReplySeconds: number | null;
}

/** Pending row for recipient inbox (GET /v1/contact-requests/inbox). */
export interface ContactRequestInboxItemView {
  id: string;
  senderPersonId: string;
  senderFullName: string | null;
  /** Department code from sender profile when set. */
  senderDepartmentCode: string | null;
  message: string;
  createdAt: Date;
  /** Where the note came from ("cities", "careers", …) and its category, for wording. */
  source: string | null;
  sourceCategory: string | null;
}

interface ContactRequestInboxRow {
  id: string;
  sender_person_id: string;
  sender_full_name: string | null;
  sender_department_code: string | null;
  message: string;
  created_at: Date;
  source: string | null;
  source_category: string | null;
}

/** Resolved outgoing requests (sender notifications: accept/decline). */
export interface ContactRequestOutgoingResolvedView {
  id: string;
  status: "accepted" | "declined";
  recipientPersonId: string;
  recipientFullName: string | null;
  respondedAt: Date;
}

interface ContactRequestOutgoingResolvedRow {
  id: string;
  status: ContactRequestStatus;
  recipient_person_id: string;
  recipient_full_name: string | null;
  responded_at: Date;
}

function mapInboxItem(row: ContactRequestInboxRow): ContactRequestInboxItemView {
  return {
    id: row.id,
    senderPersonId: row.sender_person_id,
    senderFullName: row.sender_full_name,
    senderDepartmentCode: row.sender_department_code,
    message: row.message,
    createdAt: row.created_at,
    source: row.source,
    sourceCategory: row.source_category
  };
}

function mapContactRequest(row: ContactRequestRow): ContactRequestView {
  return {
    id: row.id,
    senderPersonId: row.sender_person_id,
    recipientPersonId: row.recipient_person_id,
    message: row.message,
    status: row.status,
    recipientContactShared: row.recipient_contact_shared,
    forwardedToInstitutionalEmail: row.forwarded_to_institutional_email,
    respondedAt: row.responded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapContactRequestWithPeople(
  row: ContactRequestWithPeopleRow
): ContactRequestWithPeopleView {
  return {
    id: row.id,
    senderPersonId: row.sender_person_id,
    senderFullName: row.sender_full_name,
    senderInstitutionalEmail: row.sender_institutional_email,
    recipientPersonId: row.recipient_person_id,
    recipientFullName: row.recipient_full_name,
    recipientInstitutionalEmail: row.recipient_institutional_email,
    recipientPersonalEmail: row.recipient_personal_email,
    message: row.message,
    status: row.status,
    recipientContactShared: row.recipient_contact_shared,
    forwardedToInstitutionalEmail: row.forwarded_to_institutional_email,
    respondedAt: row.responded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class ContactRequestRepo {
  constructor(private readonly db: DbExecutor) {}

  /** Count rows created by sender in the last `windowMinutes` (for abuse limits). */
  async countOutgoingCreatedInWindow(senderPersonId: string, windowMinutes: number): Promise<number> {
    const result = await this.db.query<{ c: string }>(
      `
      SELECT COUNT(*)::text AS c
      FROM contact_requests
      WHERE sender_person_id = $1
        AND created_at >= now() - ($2::int * interval '1 minute')
      `,
      [senderPersonId, windowMinutes]
    );
    return Number.parseInt(result.rows[0]?.c ?? "0", 10);
  }

  async create(input: CreateContactRequestInput): Promise<ContactRequestView> {
    const result = await this.db.query<ContactRequestRow>(
      `
      INSERT INTO contact_requests (
        sender_person_id, recipient_person_id, message, forwarded_to_institutional_email,
        source, source_category, source_rank, city_help_offer_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        input.senderPersonId,
        input.recipientPersonId,
        input.message,
        input.forwardedToInstitutionalEmail,
        input.source ?? null,
        input.source ? (input.sourceCategory ?? null) : null,
        input.source ? (input.sourceRank ?? null) : null,
        input.cityHelpOfferId ?? null
      ]
    );
    return mapContactRequest(result.rows[0]!);
  }

  async setDeliveryChannel(id: string, channel: "email" | "whatsapp"): Promise<void> {
    await this.db.query(`UPDATE contact_requests SET delivery_channel = $2 WHERE id = $1`, [id, channel]);
  }

  /**
   * WhatsApp said the note failed: switch it to email, once. False when it was already switched,
   * was never on WhatsApp, or has been answered.
   */
  async switchPendingWhatsAppToEmail(id: string): Promise<boolean> {
    const r = await this.db.query(
      `UPDATE contact_requests SET delivery_channel = 'email'
       WHERE id = $1 AND delivery_channel = 'whatsapp' AND status = 'pending' RETURNING id`,
      [id]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async listPendingIncomingForRecipient(recipientPersonId: string): Promise<ContactRequestInboxItemView[]> {
    const result = await this.db.query<ContactRequestInboxRow>(
      `
      SELECT
        c.id,
        c.sender_person_id,
        s.full_name AS sender_full_name,
        d.code AS sender_department_code,
        c.message,
        c.created_at,
        c.source,
        c.source_category
      FROM contact_requests c
      JOIN people s ON s.id = c.sender_person_id
      LEFT JOIN departments d ON d.id = s.department_id
      WHERE c.recipient_person_id = $1
        AND c.status = 'pending'
      ORDER BY c.created_at DESC
      `,
      [recipientPersonId]
    );
    return result.rows.map(mapInboxItem);
  }

  async countPendingIncomingForRecipient(recipientPersonId: string): Promise<number> {
    const result = await this.db.query<{ c: string }>(
      `
      SELECT COUNT(*)::text AS c
      FROM contact_requests
      WHERE recipient_person_id = $1
        AND status = 'pending'
      `,
      [recipientPersonId]
    );
    return Number.parseInt(result.rows[0]?.c ?? "0", 10);
  }

  async countResolvedOutgoingForSender(senderPersonId: string): Promise<number> {
    const result = await this.db.query<{ c: string }>(
      `
      SELECT COUNT(*)::text AS c
      FROM contact_requests
      WHERE sender_person_id = $1
        AND status IN ('accepted', 'declined')
        AND responded_at IS NOT NULL
      `,
      [senderPersonId]
    );
    return Number.parseInt(result.rows[0]?.c ?? "0", 10);
  }

  async listResolvedOutgoingForSender(
    senderPersonId: string,
    limit: number
  ): Promise<ContactRequestOutgoingResolvedView[]> {
    const result = await this.db.query<ContactRequestOutgoingResolvedRow>(
      `
      SELECT
        c.id,
        c.status,
        c.recipient_person_id,
        r.full_name AS recipient_full_name,
        c.responded_at
      FROM contact_requests c
      JOIN people r ON r.id = c.recipient_person_id
      WHERE c.sender_person_id = $1
        AND c.status IN ('accepted', 'declined')
        AND c.responded_at IS NOT NULL
      ORDER BY c.responded_at DESC, c.id DESC
      LIMIT $2
      `,
      [senderPersonId, limit]
    );
    return result.rows.map((row) => ({
      id: row.id,
      status: row.status as "accepted" | "declined",
      recipientPersonId: row.recipient_person_id,
      recipientFullName: row.recipient_full_name,
      respondedAt: row.responded_at
    }));
  }

  /** True when the sender already has a note waiting for this recipient. */
  async hasPendingBetween(senderPersonId: string, recipientPersonId: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM contact_requests
       WHERE sender_person_id = $1 AND recipient_person_id = $2 AND status = 'pending'
       LIMIT 1`,
      [senderPersonId, recipientPersonId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listSentForSender(senderPersonId: string, limit: number): Promise<ContactRequestSentView[]> {
    const result = await this.db.query<{
      id: string;
      recipient_person_id: string;
      recipient_full_name: string | null;
      message: string;
      status: ContactRequestStatus;
      recipient_contact_shared: string | null;
      created_at: Date;
      responded_at: Date | null;
    }>(
      `
      SELECT c.id, c.recipient_person_id, r.full_name AS recipient_full_name, c.message, c.status,
             CASE WHEN c.status = 'accepted' THEN c.recipient_contact_shared::text END AS recipient_contact_shared,
             c.created_at, c.responded_at
      FROM contact_requests c
      JOIN people r ON r.id = c.recipient_person_id
      WHERE c.sender_person_id = $1
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT $2
      `,
      [senderPersonId, limit]
    );
    return result.rows.map((row) => ({
      id: row.id,
      recipientPersonId: row.recipient_person_id,
      recipientFullName: row.recipient_full_name,
      message: row.message,
      status: row.status,
      recipientContactShared: row.recipient_contact_shared,
      createdAt: row.created_at,
      respondedAt: row.responded_at
    }));
  }

  /** Latest note status from one sender to each of the given recipients. */
  async latestStatusFromSender(
    senderPersonId: string,
    recipientPersonIds: readonly string[]
  ): Promise<Map<string, ContactRequestStatus>> {
    if (recipientPersonIds.length === 0) return new Map();
    const result = await this.db.query<{ recipient_person_id: string; status: ContactRequestStatus }>(
      `
      SELECT DISTINCT ON (recipient_person_id) recipient_person_id, status
      FROM contact_requests
      WHERE sender_person_id = $1 AND recipient_person_id = ANY($2::uuid[])
      ORDER BY recipient_person_id, created_at DESC, id DESC
      `,
      [senderPersonId, [...recipientPersonIds]]
    );
    return new Map(result.rows.map((r) => [r.recipient_person_id, r.status]));
  }

  /**
   * Reply record per recipient over the last `windowMonths`. Notes still pending for less
   * than `graceDays` are excluded so a brand-new note never counts against anyone.
   */
  async replyStatsForRecipients(
    recipientPersonIds: readonly string[],
    windowMonths: number,
    graceDays: number
  ): Promise<RecipientReplyStatsRow[]> {
    if (recipientPersonIds.length === 0) return [];
    const result = await this.db.query<{
      recipient_person_id: string;
      considered: string;
      replied: string;
      median_reply_seconds: number | null;
    }>(
      `
      SELECT
        recipient_person_id,
        COUNT(*)::text AS considered,
        COUNT(*) FILTER (WHERE status IN ('accepted', 'declined'))::text AS replied,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (responded_at - created_at)))
          FILTER (WHERE responded_at IS NOT NULL) AS median_reply_seconds
      FROM contact_requests
      WHERE recipient_person_id = ANY($1::uuid[])
        AND created_at >= now() - ($2::int * interval '1 month')
        AND (status <> 'pending' OR created_at <= now() - ($3::int * interval '1 day'))
      GROUP BY recipient_person_id
      `,
      [[...recipientPersonIds], windowMonths, graceDays]
    );
    return result.rows.map((r) => ({
      recipientPersonId: r.recipient_person_id,
      considered: Number.parseInt(r.considered, 10),
      replied: Number.parseInt(r.replied, 10),
      medianReplySeconds: r.median_reply_seconds === null ? null : Number(r.median_reply_seconds)
    }));
  }

  /** Pending notes aged between `minDays` and `maxDays` that have not had their reminder. */
  async listRemindersDue(minDays: number, maxDays: number, limit: number): Promise<ContactRequestReminderDueView[]> {
    const result = await this.db.query<{
      id: string;
      recipient_institutional_email: string;
      recipient_full_name: string | null;
      sender_full_name: string | null;
      sender_institutional_email: string;
      message: string;
      created_at: Date;
    }>(
      `
      SELECT c.id, r.institutional_email::text AS recipient_institutional_email, r.full_name AS recipient_full_name,
             s.full_name AS sender_full_name, s.institutional_email::text AS sender_institutional_email,
             c.message, c.created_at
      FROM contact_requests c
      JOIN people r ON r.id = c.recipient_person_id
      JOIN people s ON s.id = c.sender_person_id
      WHERE c.status = 'pending'
        AND c.reminder_sent_at IS NULL
        AND c.created_at <= now() - ($1::int * interval '1 day')
        AND c.created_at > now() - ($2::int * interval '1 day')
        AND r.deleted_at IS NULL AND r.suspended_at IS NULL
        AND s.deleted_at IS NULL AND s.suspended_at IS NULL
      ORDER BY c.created_at ASC
      LIMIT $3
      `,
      [minDays, maxDays, limit]
    );
    return result.rows.map((r) => ({
      id: r.id,
      recipientInstitutionalEmail: r.recipient_institutional_email,
      recipientFullName: r.recipient_full_name,
      senderFullName: r.sender_full_name,
      senderInstitutionalEmail: r.sender_institutional_email,
      message: r.message,
      createdAt: r.created_at
    }));
  }

  /** Claim the reminder for a note; false if another run already claimed it or it was answered. */
  async claimReminder(contactRequestId: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE contact_requests SET reminder_sent_at = now()
       WHERE id = $1 AND status = 'pending' AND reminder_sent_at IS NULL`,
      [contactRequestId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Undo a claim when the email could not be sent, so the next run retries. */
  async releaseReminder(contactRequestId: string): Promise<void> {
    await this.db.query(`UPDATE contact_requests SET reminder_sent_at = NULL WHERE id = $1 AND status = 'pending'`, [
      contactRequestId
    ]);
  }

  async deleteById(contactRequestId: string): Promise<void> {
    await this.db.query(`DELETE FROM contact_requests WHERE id = $1`, [contactRequestId]);
  }

  async findByIdWithPeople(contactRequestId: string): Promise<ContactRequestWithPeopleView | null> {
    const result = await this.db.query<ContactRequestWithPeopleRow>(
      `
      SELECT
        c.id,
        c.sender_person_id,
        c.recipient_person_id,
        c.message,
        c.status,
        c.recipient_contact_shared,
        c.forwarded_to_institutional_email::TEXT AS forwarded_to_institutional_email,
        c.responded_at,
        c.created_at,
        c.updated_at,
        s.full_name AS sender_full_name,
        s.institutional_email::TEXT AS sender_institutional_email,
        r.full_name AS recipient_full_name,
        r.institutional_email::TEXT AS recipient_institutional_email,
        r.personal_email::TEXT AS recipient_personal_email
      FROM contact_requests c
      JOIN people s ON s.id = c.sender_person_id
      JOIN people r ON r.id = c.recipient_person_id
      WHERE c.id = $1
      LIMIT 1
      `,
      [contactRequestId]
    );
    const row = result.rows[0];
    return row ? mapContactRequestWithPeople(row) : null;
  }

  async markAccepted(contactRequestId: string, contactShared: string): Promise<ContactRequestView | null> {
    const result = await this.db.query<ContactRequestRow>(
      `
      UPDATE contact_requests
      SET
        status = 'accepted',
        recipient_contact_shared = $2,
        responded_at = now()
      WHERE id = $1
        AND status = 'pending'
      RETURNING *
      `,
      [contactRequestId, contactShared]
    );
    const row = result.rows[0];
    return row ? mapContactRequest(row) : null;
  }

  async markDeclined(contactRequestId: string): Promise<ContactRequestView | null> {
    const result = await this.db.query<ContactRequestRow>(
      `
      UPDATE contact_requests
      SET
        status = 'declined',
        responded_at = now(),
        recipient_contact_shared = NULL
      WHERE id = $1
        AND status = 'pending'
      RETURNING *
      `,
      [contactRequestId]
    );
    const row = result.rows[0];
    return row ? mapContactRequest(row) : null;
  }
}

