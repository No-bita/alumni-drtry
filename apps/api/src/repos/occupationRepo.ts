import type { DbExecutor } from "../db/types.js";

export interface OccupationTypeRow {
  id: string;
  code: string;
  name: string;
}

export interface OccupationRow {
  id: string;
  person_id: string;
  occupation_type_id: string;
  organization_id: string | null;
  role_title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  created_at: Date;
  updated_at: Date;
}

interface OccupationViewRow extends OccupationRow {
  occupation_type_code: string;
  occupation_type_name: string;
  organization_name: string | null;
}

export interface OccupationView {
  id: string;
  occupationTypeCode: string;
  occupationTypeName: string;
  organizationId: string | null;
  organizationName: string | null;
  roleTitle: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOccupationInput {
  personId: string;
  occupationTypeId: string;
  organizationId: string | null;
  roleTitle: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
}

export interface UpdateOccupationInput extends CreateOccupationInput {
  occupationId: string;
}

function mapView(row: OccupationViewRow): OccupationView {
  return {
    id: row.id,
    occupationTypeCode: row.occupation_type_code,
    occupationTypeName: row.occupation_type_name,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    roleTitle: row.role_title,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    isCurrent: row.is_current,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class OccupationRepo {
  constructor(private readonly db: DbExecutor) {}

  async findOccupationTypeByCode(code: string): Promise<OccupationTypeRow | null> {
    const result = await this.db.query<OccupationTypeRow>(
      `
      SELECT id, code, name
      FROM occupation_types
      WHERE code = lower($1)
        AND is_active = TRUE
      LIMIT 1
      `,
      [code]
    );
    return result.rows[0] ?? null;
  }

  async listByPerson(personId: string): Promise<OccupationView[]> {
    const result = await this.db.query<OccupationViewRow>(
      `
      SELECT
        o.*,
        ot.code AS occupation_type_code,
        ot.name AS occupation_type_name,
        org.name::TEXT AS organization_name
      FROM occupations o
      JOIN occupation_types ot ON ot.id = o.occupation_type_id
      LEFT JOIN organizations org ON org.id = o.organization_id
      WHERE o.person_id = $1
      ORDER BY o.is_current DESC, o.start_date DESC NULLS LAST, o.created_at DESC
      `,
      [personId]
    );
    return result.rows.map(mapView);
  }

  async findByIdAndPerson(occupationId: string, personId: string): Promise<OccupationView | null> {
    const result = await this.db.query<OccupationViewRow>(
      `
      SELECT
        o.*,
        ot.code AS occupation_type_code,
        ot.name AS occupation_type_name,
        org.name::TEXT AS organization_name
      FROM occupations o
      JOIN occupation_types ot ON ot.id = o.occupation_type_id
      LEFT JOIN organizations org ON org.id = o.organization_id
      WHERE o.id = $1
        AND o.person_id = $2
      LIMIT 1
      `,
      [occupationId, personId]
    );
    const row = result.rows[0];
    return row ? mapView(row) : null;
  }

  async create(input: CreateOccupationInput): Promise<OccupationView> {
    const result = await this.db.query<OccupationViewRow>(
      `
      INSERT INTO occupations (
        person_id, occupation_type_id, organization_id, role_title, description, start_date, end_date, is_current
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING
        id,
        person_id,
        occupation_type_id,
        organization_id,
        role_title,
        description,
        start_date,
        end_date,
        is_current,
        created_at,
        updated_at,
        (SELECT code FROM occupation_types WHERE id = occupation_type_id) AS occupation_type_code,
        (SELECT name FROM occupation_types WHERE id = occupation_type_id) AS occupation_type_name,
        (SELECT name::TEXT FROM organizations WHERE id = organization_id) AS organization_name
      `,
      [
        input.personId,
        input.occupationTypeId,
        input.organizationId,
        input.roleTitle,
        input.description,
        input.startDate,
        input.endDate,
        input.isCurrent
      ]
    );
    return mapView(result.rows[0]!);
  }

  async update(input: UpdateOccupationInput): Promise<OccupationView> {
    const result = await this.db.query<OccupationViewRow>(
      `
      UPDATE occupations
      SET
        occupation_type_id = $3,
        organization_id = $4,
        role_title = $5,
        description = $6,
        start_date = $7,
        end_date = $8,
        is_current = $9
      WHERE id = $1
        AND person_id = $2
      RETURNING
        id,
        person_id,
        occupation_type_id,
        organization_id,
        role_title,
        description,
        start_date,
        end_date,
        is_current,
        created_at,
        updated_at,
        (SELECT code FROM occupation_types WHERE id = occupation_type_id) AS occupation_type_code,
        (SELECT name FROM occupation_types WHERE id = occupation_type_id) AS occupation_type_name,
        (SELECT name::TEXT FROM organizations WHERE id = organization_id) AS organization_name
      `,
      [
        input.occupationId,
        input.personId,
        input.occupationTypeId,
        input.organizationId,
        input.roleTitle,
        input.description,
        input.startDate,
        input.endDate,
        input.isCurrent
      ]
    );
    return mapView(result.rows[0]!);
  }

  async deleteByIdAndPerson(occupationId: string, personId: string): Promise<boolean> {
    const result = await this.db.query(
      `
      DELETE FROM occupations
      WHERE id = $1
        AND person_id = $2
      `,
      [occupationId, personId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}

