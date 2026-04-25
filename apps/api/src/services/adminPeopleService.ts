import type { Pool } from "pg";
import { AppError } from "../lib/errors.js";
import { normalizeEmail } from "../lib/domainAllowlist.js";
import { BetaAllowedEmailRepo } from "../repos/betaAllowedEmailRepo.js";
import type { PersonRole, PersonRow } from "../repos/personRepo.js";
import { PersonRepo } from "../repos/personRepo.js";
import { SessionRepo } from "../repos/sessionRepo.js";

export interface AdminPersonView {
  id: string;
  institutionalEmail: string;
  role: PersonRole;
  fullName: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  batchYear: number | null;
  personalEmail: string | null;
  residenceCountry: string | null;
  residenceCity: string | null;
  profileCompletedAt: Date | null;
  suspendedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DuplicateGroup {
  fullName: string;
  batchYear: number | null;
  personIds: string[];
  count: number;
}

export interface UpdateAdminPersonInput {
  role?: "alumni" | "admin";
  suspendedAt?: Date | null;
}

export interface BetaAllowedEmailView {
  id: string;
  email: string;
  status: "active" | "revoked";
  notes: string | null;
  addedByPersonId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toAdminView(row: PersonRow): AdminPersonView {
  return {
    id: row.id,
    institutionalEmail: row.institutional_email,
    role: row.role,
    fullName: row.full_name,
    departmentCode: row.department_code,
    departmentName: row.department_name,
    batchYear: row.batch_year,
    personalEmail: row.personal_email,
    residenceCountry: row.residence_country,
    residenceCity: row.residence_city,
    profileCompletedAt: row.profile_completed_at,
    suspendedAt: row.suspended_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class AdminPeopleService {
  private readonly personRepo: PersonRepo;
  private readonly sessionRepo: SessionRepo;
  private readonly betaAllowedEmailRepo: BetaAllowedEmailRepo;

  constructor(private readonly pool: Pool) {
    this.personRepo = new PersonRepo(pool);
    this.sessionRepo = new SessionRepo(pool);
    this.betaAllowedEmailRepo = new BetaAllowedEmailRepo(pool);
  }

  async getPerson(personId: string): Promise<AdminPersonView> {
    const person = await this.personRepo.findById(personId);
    if (!person) {
      throw new AppError(404, "ADMIN_PERSON_NOT_FOUND", "Person not found.");
    }
    return toAdminView(person);
  }

  async updatePerson(
    personId: string,
    input: UpdateAdminPersonInput,
    actorPersonId: string
  ): Promise<AdminPersonView> {
    if (personId === actorPersonId) {
      throw new AppError(400, "ADMIN_CANNOT_MODIFY_SELF", "Cannot modify your own account.");
    }

    const person = await this.personRepo.findById(personId);
    if (!person) {
      throw new AppError(404, "ADMIN_PERSON_NOT_FOUND", "Person not found.");
    }

    const updates: { role?: "alumni" | "admin"; suspendedAt?: Date | null } = {};
    if (input.role !== undefined) updates.role = input.role;
    if (input.suspendedAt !== undefined) updates.suspendedAt = input.suspendedAt;
    const updated = await this.personRepo.updateAdminFields(personId, updates);
    if (!updated) {
      throw new AppError(500, "ADMIN_UPDATE_FAILED", "Failed to update person.");
    }

    if (input.suspendedAt != null) {
      await this.sessionRepo.revokeAllByPersonId(personId);
    }

    return toAdminView(updated);
  }

  async deletePerson(personId: string, actorPersonId: string): Promise<void> {
    if (personId === actorPersonId) {
      throw new AppError(400, "ADMIN_CANNOT_MODIFY_SELF", "Cannot delete your own account.");
    }

    const person = await this.personRepo.findById(personId);
    if (!person) {
      throw new AppError(404, "ADMIN_PERSON_NOT_FOUND", "Person not found.");
    }

    const deleted = await this.personRepo.softDelete(personId);
    if (!deleted) {
      throw new AppError(409, "ADMIN_ALREADY_DELETED", "Person is already deleted.");
    }

    await this.sessionRepo.revokeAllByPersonId(personId);
  }

  async listDuplicates(): Promise<DuplicateGroup[]> {
    return this.personRepo.findDuplicates();
  }

  async listBetaAllowedEmails(): Promise<BetaAllowedEmailView[]> {
    const rows = await this.betaAllowedEmailRepo.list();
    return rows.map((row) => ({
      id: row.id,
      email: row.email_normalized,
      status: row.status,
      notes: row.notes,
      addedByPersonId: row.added_by_person_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async addBetaAllowedEmail(email: string, actorPersonId: string, notes: string | null): Promise<BetaAllowedEmailView> {
    const normalized = normalizeEmail(email);
    const row = await this.betaAllowedEmailRepo.upsertActive(normalized, actorPersonId, notes);
    return {
      id: row.id,
      email: row.email_normalized,
      status: row.status,
      notes: row.notes,
      addedByPersonId: row.added_by_person_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async revokeBetaAllowedEmail(email: string): Promise<BetaAllowedEmailView> {
    const normalized = normalizeEmail(email);
    const row = await this.betaAllowedEmailRepo.revoke(normalized);
    if (!row) {
      throw new AppError(404, "BETA_ALLOWED_EMAIL_NOT_FOUND", "Allowed email not found.");
    }
    return {
      id: row.id,
      email: row.email_normalized,
      status: row.status,
      notes: row.notes,
      addedByPersonId: row.added_by_person_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
