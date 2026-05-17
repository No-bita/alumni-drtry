import type { DbExecutor } from "../db/types.js";
import { parseOpenToPreferences, type OpenToPreferences } from "../lib/openToPreferences.js";

export type PersonRole = "alumni" | "admin" | "super_admin";

export interface PersonRow {
  id: string;
  institutional_email: string;
  role: PersonRole;
  /** True for e2e test accounts (see `isTestInstitutionalEmail`). */
  is_test_user: boolean;
  full_name: string | null;
  department_code: string | null;
  department_name: string | null;
  department_id: string | null;
  degree_id: string | null;
  batch_year: number | null;
  personal_email: string | null;
  mobile_phone: string | null;
  bio: string | null;
  skills_text: string | null;
  residence_country: string | null;
  residence_city: string | null;
  profile_completed_at: Date | null;
  suspended_at: Date | null;
  deleted_at: Date | null;
  joining_year: number | null;
  /** Successful OTP/magic-link logins (incremented in auth verify). */
  app_login_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface UpsertPersonInput {
  institutionalEmail: string;
  departmentCode: string | null;
  departmentName: string | null;
  joiningYear: number | null;
  /** When true, row is flagged for pre-prod cleanup (`people.is_test_user`). */
  isTestUser: boolean;
}

export interface VocabularyValueRow {
  id: string;
  code: string;
  name: string;
}

export interface PersonProfileView {
  id: string;
  institutionalEmail: string;
  role: PersonRole;
  fullName: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  parsedDepartmentCode: string | null;
  parsedDepartmentName: string | null;
  batchYear: number | null;
  parsedJoiningYear: number | null;
  degreeCode: string | null;
  degreeName: string | null;
  personalEmail: string | null;
  bio: string | null;
  mobilePhone: string | null;
  residenceCountry: string | null;
  residenceCity: string | null;
  openToPreferences: OpenToPreferences | null;
  profileCompletedAt: Date | null;
  onboardingCompletedAt: Date | null;
  appLoginCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface PersonProfileRow {
  id: string;
  institutional_email: string;
  role: PersonRole;
  full_name: string | null;
  department_code: string | null;
  department_name: string | null;
  joining_year: number | null;
  batch_year: number | null;
  personal_email: string | null;
  bio: string | null;
  mobile_phone: string | null;
  residence_country: string | null;
  residence_city: string | null;
  open_to_preferences: unknown;
  profile_completed_at: Date | null;
  onboarding_completed_at: Date | null;
  app_login_count: number;
  created_at: Date;
  updated_at: Date;
  department_vocab_code: string | null;
  department_vocab_name: string | null;
  degree_vocab_code: string | null;
  degree_vocab_name: string | null;
}

export interface UpdateProfileInput {
  personId: string;
  fullName: string | null;
  departmentId: string | null;
  degreeId: string | null;
  batchYear: number | null;
  personalEmail: string | null;
  bio: string | null;
  mobilePhone: string | null;
  residenceCountry: string | null;
  residenceCity: string | null;
  openToPreferences: OpenToPreferences | null;
  profileCompletedAt: Date | null;
  onboardingCompletedAt: Date | null;
}

export interface PersonProfileIds {
  departmentId: string | null;
  degreeId: string | null;
}

export class PersonRepo {
  constructor(private readonly db: DbExecutor) {}

  async upsertByInstitutionalEmail(input: UpsertPersonInput): Promise<PersonRow> {
    const result = await this.db.query<PersonRow>(
      `
      INSERT INTO people (institutional_email, department_code, department_name, joining_year, is_test_user)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (institutional_email)
      DO UPDATE SET
        department_code = COALESCE(people.department_code, EXCLUDED.department_code),
        department_name = COALESCE(people.department_name, EXCLUDED.department_name),
        joining_year = COALESCE(people.joining_year, EXCLUDED.joining_year),
        is_test_user = people.is_test_user OR EXCLUDED.is_test_user,
        updated_at = now()
      RETURNING *
      `,
      [
        input.institutionalEmail,
        input.departmentCode,
        input.departmentName,
        input.joiningYear,
        input.isTestUser
      ]
    );
    return result.rows[0]!;
  }

  /** Called inside auth verify transaction after upsert; counts each successful login. */
  async incrementAppLoginCount(personId: string): Promise<number> {
    const result = await this.db.query<{ app_login_count: number }>(
      `
      UPDATE people
      SET app_login_count = app_login_count + 1
      WHERE id = $1
      RETURNING app_login_count
      `,
      [personId]
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error(`incrementAppLoginCount: person not found: ${personId}`);
    }
    return row.app_login_count;
  }

  async findById(personId: string): Promise<PersonRow | null> {
    const result = await this.db.query<PersonRow>(`SELECT * FROM people WHERE id = $1`, [personId]);
    return result.rows[0] ?? null;
  }

  /** Minimal row for auth bypass / actor resolution (active accounts only). */
  async findActorByInstitutionalEmail(normalizedEmail: string): Promise<{
    id: string;
    institutional_email: string;
    role: PersonRole;
    department_code: string | null;
    department_name: string | null;
    joining_year: number | null;
  } | null> {
    const result = await this.db.query<{
      id: string;
      institutional_email: string;
      role: PersonRole;
      department_code: string | null;
      department_name: string | null;
      joining_year: number | null;
    }>(
      `
      SELECT id, institutional_email, role, department_code, department_name, joining_year
      FROM people
      WHERE institutional_email = $1
        AND deleted_at IS NULL
        AND suspended_at IS NULL
      LIMIT 1
      `,
      [normalizedEmail]
    );
    return result.rows[0] ?? null;
  }

  async findDepartmentByCode(code: string): Promise<VocabularyValueRow | null> {
    const result = await this.db.query<VocabularyValueRow>(
      `
      SELECT id, code, name
      FROM departments
      WHERE code = lower($1)
        AND is_active = TRUE
      LIMIT 1
      `,
      [code]
    );
    return result.rows[0] ?? null;
  }

  async findDegreeByCode(code: string): Promise<VocabularyValueRow | null> {
    const result = await this.db.query<VocabularyValueRow>(
      `
      SELECT id, code, name
      FROM degrees
      WHERE code = lower($1)
        AND is_active = TRUE
      LIMIT 1
      `,
      [code]
    );
    return result.rows[0] ?? null;
  }

  async findProfileById(personId: string): Promise<PersonProfileView | null> {
    const result = await this.db.query<PersonProfileRow>(
      `
      SELECT
        p.id,
        p.institutional_email,
        p.role,
        p.full_name,
        p.department_code,
        p.department_name,
        p.joining_year,
        p.batch_year,
        p.personal_email,
        p.bio,
        p.mobile_phone,
        p.residence_country,
        p.residence_city,
        p.open_to_preferences,
        p.profile_completed_at,
        p.onboarding_completed_at,
        p.app_login_count,
        p.created_at,
        p.updated_at,
        d.code AS department_vocab_code,
        d.name AS department_vocab_name,
        g.code AS degree_vocab_code,
        g.name AS degree_vocab_name
      FROM people p
      LEFT JOIN departments d ON d.id = p.department_id
      LEFT JOIN degrees g ON g.id = p.degree_id
      WHERE p.id = $1
      LIMIT 1
      `,
      [personId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      institutionalEmail: row.institutional_email,
      role: row.role,
      fullName: row.full_name,
      departmentCode: row.department_vocab_code,
      departmentName: row.department_vocab_name,
      parsedDepartmentCode: row.department_code,
      parsedDepartmentName: row.department_name,
      batchYear: row.batch_year,
      parsedJoiningYear: row.joining_year,
      degreeCode: row.degree_vocab_code,
      degreeName: row.degree_vocab_name,
      personalEmail: row.personal_email,
      bio: row.bio,
      mobilePhone: row.mobile_phone,
      residenceCountry: row.residence_country,
      residenceCity: row.residence_city,
      openToPreferences: parseOpenToPreferencesRow(row.open_to_preferences),
      profileCompletedAt: row.profile_completed_at,
      onboardingCompletedAt: row.onboarding_completed_at,
      appLoginCount: row.app_login_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async findProfileIdsById(personId: string): Promise<PersonProfileIds | null> {
    const result = await this.db.query<{ department_id: string | null; degree_id: string | null }>(
      `
      SELECT department_id, degree_id
      FROM people
      WHERE id = $1
      LIMIT 1
      `,
      [personId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      departmentId: row.department_id,
      degreeId: row.degree_id
    };
  }

  async updateAdminFields(
    personId: string,
    updates: { role?: "alumni" | "admin"; suspendedAt?: Date | null }
  ): Promise<PersonRow | null> {
    const updatesList: string[] = [];
    const params: unknown[] = [personId];
    let idx = 2;

    if (updates.role !== undefined) {
      updatesList.push(`role = $${idx}`);
      params.push(updates.role);
      idx++;
    }
    if (updates.suspendedAt !== undefined) {
      updatesList.push(`suspended_at = $${idx}`);
      params.push(updates.suspendedAt);
      idx++;
    }

    if (updatesList.length === 0) {
      return this.findById(personId);
    }

    const result = await this.db.query<PersonRow>(
      `
      UPDATE people
      SET ${updatesList.join(", ")}, updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      params
    );
    return result.rows[0] ?? null;
  }

  async softDelete(personId: string): Promise<PersonRow | null> {
    const result = await this.db.query<PersonRow>(
      `
      UPDATE people
      SET deleted_at = now(), updated_at = now()
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING *
      `,
      [personId]
    );
    return result.rows[0] ?? null;
  }

  async findDuplicates(): Promise<
    { fullName: string; batchYear: number | null; personIds: string[]; count: number }[]
  > {
    const result = await this.db.query<{
      full_name: string;
      batch_year: number | null;
      person_ids: string[];
      cnt: number;
    }>(
      `
      SELECT
        COALESCE(full_name, '') AS full_name,
        COALESCE(batch_year, joining_year) AS batch_year,
        array_agg(id ORDER BY created_at) AS person_ids,
        count(*)::int AS cnt
      FROM people
      WHERE deleted_at IS NULL
        AND full_name IS NOT NULL
        AND trim(full_name) <> ''
      GROUP BY
        lower(trim(full_name)),
        COALESCE(batch_year, joining_year)
      HAVING count(*) > 1
      ORDER BY cnt DESC, full_name ASC
      `
    );
    return result.rows.map((r) => ({
      fullName: r.full_name,
      batchYear: r.batch_year,
      personIds: r.person_ids,
      count: r.cnt
    }));
  }

  async updateProfile(input: UpdateProfileInput): Promise<PersonProfileView> {
    const result = await this.db.query<PersonProfileRow>(
      `
      UPDATE people
      SET
        full_name = $2,
        department_id = $3,
        degree_id = $4,
        batch_year = $5,
        personal_email = $6,
        bio = $7,
        mobile_phone = $8,
        profile_completed_at = $9,
        onboarding_completed_at = $10,
        residence_country = $11,
        residence_city = $12,
        open_to_preferences = $13
      WHERE id = $1
      RETURNING
        id,
        institutional_email,
        role,
        full_name,
        department_code,
        department_name,
        joining_year,
        batch_year,
        personal_email,
        bio,
        mobile_phone,
        residence_country,
        residence_city,
        open_to_preferences,
        profile_completed_at,
        onboarding_completed_at,
        app_login_count,
        created_at,
        updated_at,
        (
          SELECT d.code FROM departments d WHERE d.id = people.department_id
        ) AS department_vocab_code,
        (
          SELECT d.name FROM departments d WHERE d.id = people.department_id
        ) AS department_vocab_name,
        (
          SELECT g.code FROM degrees g WHERE g.id = people.degree_id
        ) AS degree_vocab_code,
        (
          SELECT g.name FROM degrees g WHERE g.id = people.degree_id
        ) AS degree_vocab_name
      `,
      [
        input.personId,
        input.fullName,
        input.departmentId,
        input.degreeId,
        input.batchYear,
        input.personalEmail,
        input.bio,
        input.mobilePhone,
        input.profileCompletedAt,
        input.onboardingCompletedAt,
        input.residenceCountry,
        input.residenceCity,
        input.openToPreferences
      ]
    );
    const row = result.rows[0]!;
    return {
      id: row.id,
      institutionalEmail: row.institutional_email,
      role: row.role,
      fullName: row.full_name,
      departmentCode: row.department_vocab_code,
      departmentName: row.department_vocab_name,
      parsedDepartmentCode: row.department_code,
      parsedDepartmentName: row.department_name,
      batchYear: row.batch_year,
      parsedJoiningYear: row.joining_year,
      degreeCode: row.degree_vocab_code,
      degreeName: row.degree_vocab_name,
      personalEmail: row.personal_email,
      bio: row.bio,
      mobilePhone: row.mobile_phone,
      residenceCountry: row.residence_country,
      residenceCity: row.residence_city,
      openToPreferences: parseOpenToPreferencesRow(row.open_to_preferences),
      profileCompletedAt: row.profile_completed_at,
      onboardingCompletedAt: row.onboarding_completed_at,
      appLoginCount: row.app_login_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

function parseOpenToPreferencesRow(raw: unknown): OpenToPreferences | null {
  return parseOpenToPreferences(raw);
}
