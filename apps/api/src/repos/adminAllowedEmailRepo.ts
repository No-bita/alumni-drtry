import type { DbExecutor } from "../db/types.js";
import { normalizeEmail } from "../lib/domainAllowlist.js";

export interface AdminAllowedEmailRow {
  id: string;
  email_normalized: string;
  status: "active" | "revoked";
  notes: string | null;
  added_by_person_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export class AdminAllowedEmailRepo {
  constructor(private readonly db: DbExecutor) {}

  async isAllowed(email: string): Promise<boolean> {
    const normalized = normalizeEmail(email);
    const result = await this.db.query<{ ok: boolean }>(
      `
      SELECT EXISTS(
        SELECT 1
        FROM admin_allowed_emails
        WHERE email_normalized = $1
          AND status = 'active'
      ) AS ok
      `,
      [normalized]
    );
    return Boolean(result.rows[0]?.ok);
  }

  async list(): Promise<AdminAllowedEmailRow[]> {
    const result = await this.db.query<AdminAllowedEmailRow>(
      `
      SELECT *
      FROM admin_allowed_emails
      ORDER BY created_at DESC
      `
    );
    return result.rows;
  }

  async upsertActive(email: string, addedByPersonId: string, notes: string | null): Promise<AdminAllowedEmailRow> {
    const normalized = normalizeEmail(email);
    const result = await this.db.query<AdminAllowedEmailRow>(
      `
      INSERT INTO admin_allowed_emails (email_normalized, status, notes, added_by_person_id)
      VALUES ($1, 'active', $2, $3)
      ON CONFLICT (email_normalized)
      DO UPDATE SET
        status = 'active',
        notes = EXCLUDED.notes,
        added_by_person_id = EXCLUDED.added_by_person_id,
        updated_at = now()
      RETURNING *
      `,
      [normalized, notes, addedByPersonId]
    );
    return result.rows[0]!;
  }

  async revoke(email: string): Promise<AdminAllowedEmailRow | null> {
    const normalized = normalizeEmail(email);
    const result = await this.db.query<AdminAllowedEmailRow>(
      `
      UPDATE admin_allowed_emails
      SET status = 'revoked', updated_at = now()
      WHERE email_normalized = $1
      RETURNING *
      `,
      [normalized]
    );
    return result.rows[0] ?? null;
  }
}
