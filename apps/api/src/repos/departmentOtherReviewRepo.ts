import type { DbExecutor } from "../db/types.js";

// Review queue for member-typed "Other" departments. Typed text is never public until approved;
// every action also writes department_other_history (append-only). Review columns on people hold
// only the current state. Approving never creates a catalog department; linking moves the member
// to an existing canonical department (admin-only exception to the member-side department freeze).

export type DepartmentOtherStatus = "pending" | "approved" | "rejected";

export interface DepartmentOtherQueueRow {
  person_id: string;
  full_name: string;
  institutional_email: string;
  batch_year: number | null;
  department_other_text: string;
  department_other_status: DepartmentOtherStatus;
  department_other_rejection_reason: string | null;
  updated_at: Date;
}

export interface DepartmentOtherHistoryRow {
  id: string;
  person_id: string;
  person_name: string | null;
  action: "submitted" | "approved" | "rejected" | "linked";
  actor_person_id: string | null;
  actor_name: string | null;
  submitted_text: string | null;
  target_department_id: string | null;
  target_department_name: string | null;
  reason: string | null;
  created_at: Date;
}

const QUEUE_COLUMNS = `p.id AS person_id, p.full_name, p.institutional_email, p.batch_year,
  p.department_other_text, p.department_other_status, p.department_other_rejection_reason, p.updated_at`;

export class DepartmentOtherReviewRepo {
  constructor(private readonly db: DbExecutor) {}

  async queue(status: "pending" | "rejected", q: string): Promise<DepartmentOtherQueueRow[]> {
    const r = await this.db.query<DepartmentOtherQueueRow>(
      `SELECT ${QUEUE_COLUMNS}
       FROM people p
       JOIN departments d ON d.id = p.department_id AND d.code = 'other'
       WHERE p.department_other_status = $1
         AND p.deleted_at IS NULL
         AND ($2 = '' OR p.full_name ILIKE '%' || $2 || '%' OR p.department_other_text ILIKE '%' || $2 || '%')
       ORDER BY p.updated_at ASC
       LIMIT 100`,
      [status, q]
    );
    return r.rows;
  }

  async history(personId: string | null, limit: number): Promise<DepartmentOtherHistoryRow[]> {
    const r = await this.db.query<DepartmentOtherHistoryRow>(
      `SELECT h.id, h.person_id, p.full_name AS person_name, h.action,
              h.actor_person_id, a.full_name AS actor_name, h.submitted_text,
              h.target_department_id, d.name AS target_department_name, h.reason, h.created_at
       FROM department_other_history h
       LEFT JOIN people p ON p.id = h.person_id
       LEFT JOIN people a ON a.id = h.actor_person_id
       LEFT JOIN departments d ON d.id = h.target_department_id
       WHERE ($1::uuid IS NULL OR h.person_id = $1::uuid)
       ORDER BY h.created_at DESC
       LIMIT $2`,
      [personId, limit]
    );
    return r.rows;
  }

  async findSubmission(personId: string) {
    const r = await this.db.query<{
      person_id: string;
      department_id: string | null;
      department_code: string | null;
      department_other_text: string | null;
      department_other_status: DepartmentOtherStatus;
    }>(
      `SELECT p.id AS person_id, p.department_id, d.code AS department_code,
              p.department_other_text, p.department_other_status
       FROM people p LEFT JOIN departments d ON d.id = p.department_id
       WHERE p.id = $1::uuid AND p.deleted_at IS NULL`,
      [personId]
    );
    return r.rows[0] ?? null;
  }

  /**
   * Approve exactly the text the admin reviewed. One statement: the status update and the history row
   * commit together, and only if the stored text still equals `expectedText`. Returns false (nothing
   * written) when the member changed the text since it was reviewed.
   */
  async approve(personId: string, reviewerId: string, expectedText: string): Promise<boolean> {
    const r = await this.db.query(
      `WITH approved AS (
         UPDATE people
         SET department_other_status = 'approved', department_other_rejection_reason = NULL,
             department_other_reviewed_by = $2::uuid, department_other_reviewed_at = now(), updated_at = now()
         WHERE id = $1::uuid AND deleted_at IS NULL AND department_other_text = $3
           AND department_id = (SELECT id FROM departments WHERE code = 'other')
         RETURNING id, department_other_text
       )
       INSERT INTO department_other_history (person_id, action, actor_person_id, submitted_text)
       SELECT id, 'approved', $2::uuid, department_other_text FROM approved`,
      [personId, reviewerId, expectedText]
    );
    return (r.rowCount ?? 0) > 0;
  }

  /** Reject exactly the text the admin reviewed; same one-statement, text-bound rule as approve. */
  async reject(personId: string, reviewerId: string, reason: string, expectedText: string): Promise<boolean> {
    const r = await this.db.query(
      `WITH rejected AS (
         UPDATE people
         SET department_other_status = 'rejected', department_other_rejection_reason = $3,
             department_other_reviewed_by = $2::uuid, department_other_reviewed_at = now(), updated_at = now()
         WHERE id = $1::uuid AND deleted_at IS NULL AND department_other_text = $4
           AND department_id = (SELECT id FROM departments WHERE code = 'other')
         RETURNING id, department_other_text
       )
       INSERT INTO department_other_history (person_id, action, actor_person_id, submitted_text, reason)
       SELECT id, 'rejected', $2::uuid, department_other_text, $3 FROM rejected`,
      [personId, reviewerId, reason, expectedText]
    );
    return (r.rowCount ?? 0) > 0;
  }

  /**
   * Move the member to an existing canonical department. The typed text stays stored. Only applies if the
   * stored text still equals `expectedText`; status change and history row are one statement.
   */
  async link(personId: string, reviewerId: string, departmentId: string, expectedText: string): Promise<boolean> {
    const r = await this.db.query(
      `WITH linked AS (
         UPDATE people
         SET department_id = $2::uuid,
             department_other_status = 'approved', department_other_rejection_reason = NULL,
             department_other_reviewed_by = $3::uuid, department_other_reviewed_at = now(), updated_at = now()
         WHERE id = $1::uuid AND deleted_at IS NULL AND department_other_text = $4
           AND department_id = (SELECT id FROM departments WHERE code = 'other')
         RETURNING id, department_other_text
       )
       INSERT INTO department_other_history (person_id, action, actor_person_id, submitted_text, target_department_id)
       SELECT id, 'linked', $3::uuid, department_other_text, $2::uuid FROM linked`,
      [personId, departmentId, reviewerId, expectedText]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async findDepartmentById(id: string): Promise<{ id: string; code: string; name: string } | null> {
    const r = await this.db.query<{ id: string; code: string; name: string }>(
      `SELECT id, code, name FROM departments WHERE id = $1::uuid`,
      [id]
    );
    return r.rows[0] ?? null;
  }

  async findDepartmentByCode(code: string): Promise<{ id: string; code: string; name: string } | null> {
    const r = await this.db.query<{ id: string; code: string; name: string }>(
      `SELECT id, code, name FROM departments WHERE code = $1`,
      [code]
    );
    return r.rows[0] ?? null;
  }

  async listDepartments(): Promise<{ id: string; code: string; name: string }[]> {
    const r = await this.db.query<{ id: string; code: string; name: string }>(
      `SELECT id, code, name FROM departments ORDER BY name`
    );
    return r.rows;
  }
}
