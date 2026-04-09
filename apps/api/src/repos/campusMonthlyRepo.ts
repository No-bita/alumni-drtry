import type { Pool } from "pg";

export type CampusMonthlyIssueRow = {
  id: string;
  issueMonth: Date;
  pdfBytes: Buffer;
  uploadedBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export class CampusMonthlyRepo {
  constructor(private readonly db: Pool) {}

  async findLatest(): Promise<CampusMonthlyIssueRow | null> {
    const result = await this.db.query<{
      id: string;
      issue_month: Date;
      pdf_bytes: Buffer;
      uploaded_by: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `
      SELECT id, issue_month, pdf_bytes, uploaded_by, created_at, updated_at
      FROM campus_monthly_issues
      ORDER BY issue_month DESC
      LIMIT 1
      `
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      issueMonth: row.issue_month,
      pdfBytes: row.pdf_bytes,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async upsertIssue(input: {
    issueMonth: Date;
    pdfBytes: Buffer;
    uploadedBy: string;
  }): Promise<CampusMonthlyIssueRow> {
    const result = await this.db.query<{
      id: string;
      issue_month: Date;
      pdf_bytes: Buffer;
      uploaded_by: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `
      INSERT INTO campus_monthly_issues (issue_month, pdf_bytes, uploaded_by)
      VALUES ($1::date, $2::bytea, $3::uuid)
      ON CONFLICT (issue_month) DO UPDATE SET
        pdf_bytes = EXCLUDED.pdf_bytes,
        uploaded_by = EXCLUDED.uploaded_by,
        updated_at = now()
      RETURNING id, issue_month, pdf_bytes, uploaded_by, created_at, updated_at
      `,
      [input.issueMonth, input.pdfBytes, input.uploadedBy]
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("campus_monthly_issues upsert returned no row");
    }
    return {
      id: row.id,
      issueMonth: row.issue_month,
      pdfBytes: row.pdf_bytes,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
