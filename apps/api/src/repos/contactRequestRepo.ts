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

export interface CreateContactRequestInput {
  senderPersonId: string;
  recipientPersonId: string;
  message: string;
  forwardedToInstitutionalEmail: string;
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
}

interface ContactRequestInboxRow {
  id: string;
  sender_person_id: string;
  sender_full_name: string | null;
  sender_department_code: string | null;
  message: string;
  created_at: Date;
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
    createdAt: row.created_at
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
        sender_person_id, recipient_person_id, message, forwarded_to_institutional_email
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [
        input.senderPersonId,
        input.recipientPersonId,
        input.message,
        input.forwardedToInstitutionalEmail
      ]
    );
    return mapContactRequest(result.rows[0]!);
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
        c.created_at
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

