import type { DbExecutor } from "../db/types.js";

export type OrganizationApprovalStatus = "pending" | "approved" | "rejected";

interface OrganizationRow {
  id: string;
  name: string;
  approval_status: OrganizationApprovalStatus;
  canonical_organization_id: string | null;
  created_by_person_id: string | null;
  reviewed_by_person_id: string | null;
  reviewed_at: Date | null;
  rejection_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface OrganizationView {
  id: string;
  name: string;
  approvalStatus: OrganizationApprovalStatus;
  canonicalOrganizationId: string | null;
  createdByPersonId: string | null;
  reviewedByPersonId: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PendingOrganizationView extends OrganizationView {
  createdByInstitutionalEmail: string | null;
}

interface PendingOrganizationRow extends OrganizationRow {
  created_by_institutional_email: string | null;
}

function mapOrganization(row: OrganizationRow): OrganizationView {
  return {
    id: row.id,
    name: row.name,
    approvalStatus: row.approval_status,
    canonicalOrganizationId: row.canonical_organization_id,
    createdByPersonId: row.created_by_person_id,
    reviewedByPersonId: row.reviewed_by_person_id,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPendingOrganization(row: PendingOrganizationRow): PendingOrganizationView {
  return {
    ...mapOrganization(row),
    createdByInstitutionalEmail: row.created_by_institutional_email
  };
}

export class OrganizationRepo {
  constructor(private readonly db: DbExecutor) {}

  async findByName(name: string): Promise<OrganizationView | null> {
    const result = await this.db.query<OrganizationRow>(
      `
      SELECT
        id,
        name::TEXT AS name,
        approval_status,
        canonical_organization_id,
        created_by_person_id,
        reviewed_by_person_id,
        reviewed_at,
        rejection_reason,
        created_at,
        updated_at
      FROM organizations
      WHERE name = $1::CITEXT
      LIMIT 1
      `,
      [name]
    );
    const row = result.rows[0];
    return row ? mapOrganization(row) : null;
  }

  async findById(organizationId: string): Promise<OrganizationView | null> {
    const result = await this.db.query<OrganizationRow>(
      `
      SELECT
        id,
        name::TEXT AS name,
        approval_status,
        canonical_organization_id,
        created_by_person_id,
        reviewed_by_person_id,
        reviewed_at,
        rejection_reason,
        created_at,
        updated_at
      FROM organizations
      WHERE id = $1
      LIMIT 1
      `,
      [organizationId]
    );
    const row = result.rows[0];
    return row ? mapOrganization(row) : null;
  }

  async createPending(name: string, createdByPersonId: string): Promise<OrganizationView> {
    const result = await this.db.query<OrganizationRow>(
      `
      INSERT INTO organizations (name, approval_status, created_by_person_id)
      VALUES ($1, 'pending', $2)
      RETURNING
        id,
        name::TEXT AS name,
        approval_status,
        canonical_organization_id,
        created_by_person_id,
        reviewed_by_person_id,
        reviewed_at,
        rejection_reason,
        created_at,
        updated_at
      `,
      [name, createdByPersonId]
    );
    return mapOrganization(result.rows[0]!);
  }

  async listPending(limit: number): Promise<PendingOrganizationView[]> {
    const result = await this.db.query<PendingOrganizationRow>(
      `
      SELECT
        o.id,
        o.name::TEXT AS name,
        o.approval_status,
        o.canonical_organization_id,
        o.created_by_person_id,
        o.reviewed_by_person_id,
        o.reviewed_at,
        o.rejection_reason,
        o.created_at,
        o.updated_at,
        p.institutional_email::TEXT AS created_by_institutional_email
      FROM organizations o
      LEFT JOIN people p ON p.id = o.created_by_person_id
      WHERE o.approval_status = 'pending'
      ORDER BY o.created_at ASC
      LIMIT $1
      `,
      [limit]
    );
    return result.rows.map(mapPendingOrganization);
  }

  async approve(
    organizationId: string,
    reviewedByPersonId: string,
    canonicalOrganizationId: string | null
  ): Promise<OrganizationView> {
    const result = await this.db.query<OrganizationRow>(
      `
      UPDATE organizations
      SET
        approval_status = 'approved',
        canonical_organization_id = $3,
        reviewed_by_person_id = $2,
        reviewed_at = now(),
        rejection_reason = NULL
      WHERE id = $1
      RETURNING
        id,
        name::TEXT AS name,
        approval_status,
        canonical_organization_id,
        created_by_person_id,
        reviewed_by_person_id,
        reviewed_at,
        rejection_reason,
        created_at,
        updated_at
      `,
      [organizationId, reviewedByPersonId, canonicalOrganizationId]
    );
    return mapOrganization(result.rows[0]!);
  }

  async reject(
    organizationId: string,
    reviewedByPersonId: string,
    reason: string
  ): Promise<OrganizationView> {
    const result = await this.db.query<OrganizationRow>(
      `
      UPDATE organizations
      SET
        approval_status = 'rejected',
        reviewed_by_person_id = $2,
        reviewed_at = now(),
        rejection_reason = $3,
        canonical_organization_id = NULL
      WHERE id = $1
      RETURNING
        id,
        name::TEXT AS name,
        approval_status,
        canonical_organization_id,
        created_by_person_id,
        reviewed_by_person_id,
        reviewed_at,
        rejection_reason,
        created_at,
        updated_at
      `,
      [organizationId, reviewedByPersonId, reason]
    );
    return mapOrganization(result.rows[0]!);
  }
}

