import type { Pool } from "pg";
import { AppError } from "../lib/errors.js";
import { OccupationRepo, type OccupationView } from "../repos/occupationRepo.js";
import { OrganizationRepo } from "../repos/organizationRepo.js";

export interface UpsertOccupationInput {
  occupationTypeCode: string;
  organizationId?: string | null;
  roleTitle: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateDateFormat(value: string | null): void {
  if (!value) {
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(400, "OCCUPATION_BAD_DATE", "Dates must be in YYYY-MM-DD format.");
  }
}

function validateDateRange(startDate: string | null, endDate: string | null): void {
  if (!startDate || !endDate) {
    return;
  }
  if (startDate > endDate) {
    throw new AppError(400, "OCCUPATION_BAD_DATE_RANGE", "startDate must be before or equal to endDate.");
  }
}

export class OccupationService {
  private readonly occupationRepo: OccupationRepo;
  private readonly organizationRepo: OrganizationRepo;

  constructor(private readonly pool: Pool) {
    this.occupationRepo = new OccupationRepo(pool);
    this.organizationRepo = new OrganizationRepo(pool);
  }

  async listMyOccupations(personId: string): Promise<OccupationView[]> {
    return this.occupationRepo.listByPerson(personId);
  }

  async createMyOccupation(personId: string, input: UpsertOccupationInput): Promise<OccupationView> {
    const occupationType = await this.occupationRepo.findOccupationTypeByCode(input.occupationTypeCode);
    if (!occupationType) {
      throw new AppError(400, "OCCUPATION_INVALID_TYPE", "Invalid occupationTypeCode.");
    }

    let organizationId: string | null = null;
    if (input.organizationId !== undefined && input.organizationId !== null) {
      const organization = await this.organizationRepo.findById(input.organizationId);
      if (!organization || organization.approvalStatus !== "approved") {
        throw new AppError(400, "OCCUPATION_INVALID_ORG", "Organization must exist and be approved.");
      }
      organizationId = organization.id;
    }

    const roleTitle = input.roleTitle.trim();
    const description = normalizeOptionalText(input.description);
    const startDate = normalizeOptionalText(input.startDate);
    let endDate = normalizeOptionalText(input.endDate);
    const isCurrent = input.isCurrent ?? true;

    validateDateFormat(startDate);
    validateDateFormat(endDate);
    if (isCurrent) {
      endDate = null;
    }
    validateDateRange(startDate, endDate);

    return this.occupationRepo.create({
      personId,
      occupationTypeId: occupationType.id,
      organizationId,
      roleTitle,
      description,
      startDate,
      endDate,
      isCurrent
    });
  }

  async updateMyOccupation(
    personId: string,
    occupationId: string,
    patch: Partial<UpsertOccupationInput>
  ): Promise<OccupationView> {
    const current = await this.occupationRepo.findByIdAndPerson(occupationId, personId);
    if (!current) {
      throw new AppError(404, "OCCUPATION_NOT_FOUND", "Occupation not found.");
    }

    const nextOccupationTypeCode = patch.occupationTypeCode ?? current.occupationTypeCode;
    const occupationType = await this.occupationRepo.findOccupationTypeByCode(nextOccupationTypeCode);
    if (!occupationType) {
      throw new AppError(400, "OCCUPATION_INVALID_TYPE", "Invalid occupationTypeCode.");
    }

    let nextOrganizationId = current.organizationId;
    if (patch.organizationId !== undefined) {
      if (patch.organizationId === null) {
        nextOrganizationId = null;
      } else {
        const organization = await this.organizationRepo.findById(patch.organizationId);
        if (!organization || organization.approvalStatus !== "approved") {
          throw new AppError(400, "OCCUPATION_INVALID_ORG", "Organization must exist and be approved.");
        }
        nextOrganizationId = organization.id;
      }
    }

    const nextRoleTitle =
      patch.roleTitle !== undefined ? patch.roleTitle.trim() : current.roleTitle;
    const nextDescription =
      patch.description !== undefined ? normalizeOptionalText(patch.description) : current.description;
    const nextStartDate =
      patch.startDate !== undefined ? normalizeOptionalText(patch.startDate) : current.startDate;
    const nextIsCurrent = patch.isCurrent ?? current.isCurrent;
    let nextEndDate =
      patch.endDate !== undefined ? normalizeOptionalText(patch.endDate) : current.endDate;

    validateDateFormat(nextStartDate);
    validateDateFormat(nextEndDate);
    if (nextIsCurrent) {
      nextEndDate = null;
    }
    validateDateRange(nextStartDate, nextEndDate);

    return this.occupationRepo.update({
      occupationId,
      personId,
      occupationTypeId: occupationType.id,
      organizationId: nextOrganizationId,
      roleTitle: nextRoleTitle,
      description: nextDescription,
      startDate: nextStartDate,
      endDate: nextEndDate,
      isCurrent: nextIsCurrent
    });
  }

  async deleteMyOccupation(personId: string, occupationId: string): Promise<void> {
    const deleted = await this.occupationRepo.deleteByIdAndPerson(occupationId, personId);
    if (!deleted) {
      throw new AppError(404, "OCCUPATION_NOT_FOUND", "Occupation not found.");
    }
  }
}

