import type { DbExecutor } from "../db/types.js";

export type OrganizationApprovalStatus = "pending" | "approved" | "rejected";

interface OrganizationRow {
  id: string;
  name: string;
  approval_status: OrganizationApprovalStatus;
  canonical_organization_id: string | null;
  submitted_name: string | null;
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
  /** The name as first typed, kept once an admin renames it (null if never renamed). */
  submittedName: string | null;
  createdByPersonId: string | null;
  reviewedByPersonId: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PendingOrganizationView extends OrganizationView {
  /** Who typed it, masked for the review screen: "sh•••@itbhu.ac.in". The full address never leaves the API. */
  createdByEmailMasked: string | null;
}

/** For the "Same company as…" picker: just enough to choose. */
export interface ApprovedOrganizationOption {
  id: string;
  name: string;
}

/** A row in Company review's "Approved companies" section. */
export interface ApprovedOrganizationListItem {
  id: string;
  name: string;
  submittedName: string | null;
  /** The main company this name is linked to ("Same company as…"), or null if it's a main company itself. */
  linkedTo: { id: string; name: string } | null;
  /** How many other names are linked to this one. */
  linkedNames: number;
}

/** "shahaaryan.milan.mst20@itbhu.ac.in" → "sh•••@itbhu.ac.in" (one visible letter for very short names). */
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  const local = email.slice(0, at);
  const visible = local.length <= 3 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}•••${email.slice(at)}`;
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
    submittedName: row.submitted_name,
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
    createdByEmailMasked: maskEmail(row.created_by_institutional_email)
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
        submitted_name,
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
        submitted_name,
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
        submitted_name,
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
        o.submitted_name,
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

  /**
   * Approved companies that aren't themselves linked to another (the ones a name can be linked to).
   * Case-insensitive "contains" search on the name (% and _ typed by the admin are plain text),
   * ordered by name. An empty search returns the first ones alphabetically.
   */
  async listApprovedOptions(search: string, limit: number): Promise<ApprovedOrganizationOption[]> {
    const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const result = await this.db.query<ApprovedOrganizationOption>(
      `
      SELECT id, name::TEXT AS name
      FROM organizations
      WHERE approval_status = 'approved'
        AND canonical_organization_id IS NULL
        AND name::TEXT ILIKE $1 ESCAPE '\\'
      ORDER BY lower(name::TEXT), name::TEXT, id
      LIMIT $2
      `,
      [pattern, limit]
    );
    return result.rows;
  }

  /**
   * Every approved company, linked or not, whose name (or first-typed name) contains `search`
   * (case-insensitive; % and _ are plain text), by name.
   */
  async listApproved(search: string, limit: number): Promise<ApprovedOrganizationListItem[]> {
    const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const result = await this.db.query<{
      id: string;
      name: string;
      submitted_name: string | null;
      main_id: string | null;
      main_name: string | null;
      linked_names: number;
    }>(
      `
      SELECT
        o.id,
        o.name::TEXT AS name,
        o.submitted_name,
        main.id AS main_id,
        main.name::TEXT AS main_name,
        (SELECT count(*)::INT FROM organizations l WHERE l.canonical_organization_id = o.id) AS linked_names
      FROM organizations o
      LEFT JOIN organizations main ON main.id = o.canonical_organization_id
      WHERE o.approval_status = 'approved'
        AND (o.name::TEXT ILIKE $1 ESCAPE '\\' OR o.submitted_name ILIKE $1 ESCAPE '\\')
      ORDER BY lower(o.name::TEXT), o.name::TEXT, o.id
      LIMIT $2
      `,
      [pattern, limit]
    );
    return result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      submittedName: r.submitted_name,
      linkedTo: r.main_id && r.main_name ? { id: r.main_id, name: r.main_name } : null,
      linkedNames: r.linked_names
    }));
  }

  /** Rename. The first name it had is kept in submitted_name (later renames don't overwrite it). */
  async rename(organizationId: string, name: string): Promise<OrganizationView> {
    const result = await this.db.query<OrganizationRow>(
      `
      UPDATE organizations
      SET
        submitted_name = COALESCE(submitted_name, name::TEXT),
        name = $2
      WHERE id = $1
      RETURNING
        id,
        name::TEXT AS name,
        approval_status,
        canonical_organization_id,
        submitted_name,
        created_by_person_id,
        reviewed_by_person_id,
        reviewed_at,
        rejection_reason,
        created_at,
        updated_at
      `,
      [organizationId, name]
    );
    return mapOrganization(result.rows[0]!);
  }

  /** Point every name linked to `fromId` at `toId` instead. Returns how many moved. */
  async moveLinkedNames(fromId: string, toId: string): Promise<number> {
    const result = await this.db.query(
      `UPDATE organizations SET canonical_organization_id = $2 WHERE canonical_organization_id = $1`,
      [fromId, toId]
    );
    return result.rowCount ?? 0;
  }

  /** Link an already approved company to a main one (approval fields unchanged). */
  async setCanonical(organizationId: string, canonicalOrganizationId: string): Promise<OrganizationView> {
    const result = await this.db.query<OrganizationRow>(
      `
      UPDATE organizations
      SET canonical_organization_id = $2
      WHERE id = $1
      RETURNING
        id,
        name::TEXT AS name,
        approval_status,
        canonical_organization_id,
        submitted_name,
        created_by_person_id,
        reviewed_by_person_id,
        reviewed_at,
        rejection_reason,
        created_at,
        updated_at
      `,
      [organizationId, canonicalOrganizationId]
    );
    return mapOrganization(result.rows[0]!);
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
        submitted_name,
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
        submitted_name,
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

