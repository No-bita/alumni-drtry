import type { Pool } from "pg";
import { AppError } from "../lib/errors.js";
import { normalizeEmail } from "../lib/domainAllowlist.js";
import { PersonRepo, type PersonProfileView } from "../repos/personRepo.js";

export interface UpdateMyProfileInput {
  fullName?: string;
  departmentCode?: string;
  batchYear?: number;
  degreeCode?: string | null;
  personalEmail?: string | null;
  bio?: string | null;
  skillsText?: string | null;
}

function isPgUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export class ProfileService {
  private readonly personRepo: PersonRepo;

  constructor(private readonly pool: Pool) {
    this.personRepo = new PersonRepo(pool);
  }

  async getMyProfile(personId: string): Promise<PersonProfileView> {
    const profile = await this.personRepo.findProfileById(personId);
    if (!profile) {
      throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found.");
    }
    return profile;
  }

  async updateMyProfile(personId: string, input: UpdateMyProfileInput): Promise<PersonProfileView> {
    const current = await this.personRepo.findProfileById(personId);
    if (!current) {
      throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found.");
    }
    const currentIds = await this.personRepo.findProfileIdsById(personId);
    if (!currentIds) {
      throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found.");
    }

    let nextFullName = current.fullName;
    let nextDepartmentCode = current.departmentCode;
    let nextDepartmentId: string | null = null;
    let nextDegreeId: string | null = null;
    let nextBatchYear = current.batchYear;
    let nextPersonalEmail = current.personalEmail;
    let nextBio = current.bio;
    let nextSkillsText = current.skillsText;

    if (input.fullName !== undefined) {
      nextFullName = input.fullName.trim();
    }

    if (input.departmentCode !== undefined) {
      const department = await this.personRepo.findDepartmentByCode(input.departmentCode);
      if (!department) {
        throw new AppError(400, "PROFILE_INVALID_DEPARTMENT", "Invalid department code.");
      }
      nextDepartmentCode = department.code;
      nextDepartmentId = department.id;
    } else {
      nextDepartmentId = currentIds.departmentId;
    }

    if (input.degreeCode !== undefined) {
      if (input.degreeCode === null) {
        nextDegreeId = null;
      } else {
        const degree = await this.personRepo.findDegreeByCode(input.degreeCode);
        if (!degree) {
          throw new AppError(400, "PROFILE_INVALID_DEGREE", "Invalid degree code.");
        }
        nextDegreeId = degree.id;
      }
    } else {
      nextDegreeId = currentIds.degreeId;
    }

    if (input.batchYear !== undefined) {
      nextBatchYear = input.batchYear;
    }

    if (input.personalEmail !== undefined) {
      nextPersonalEmail = input.personalEmail === null ? null : normalizeEmail(input.personalEmail);
    }

    if (input.bio !== undefined) {
      nextBio = input.bio === null ? null : input.bio.trim();
    }

    if (input.skillsText !== undefined) {
      nextSkillsText = input.skillsText === null ? null : input.skillsText.trim();
    }

    const hasName = Boolean(nextFullName && nextFullName.length > 0);
    const hasDepartment = Boolean(nextDepartmentId || nextDepartmentCode || current.parsedDepartmentCode);
    const hasBatch = Boolean(nextBatchYear || current.parsedJoiningYear);
    const nextIsSearchable = hasName && hasDepartment && hasBatch;
    const nextProfileCompletedAt =
      current.profileCompletedAt ?? (nextIsSearchable ? new Date() : null);

    try {
      return await this.personRepo.updateProfile({
        personId,
        fullName: nextFullName,
        departmentId: nextDepartmentId,
        degreeId: nextDegreeId,
        batchYear: nextBatchYear,
        personalEmail: nextPersonalEmail,
        bio: nextBio,
        skillsText: nextSkillsText,
        isSearchable: nextIsSearchable,
        profileCompletedAt: nextProfileCompletedAt
      });
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new AppError(409, "PROFILE_PERSONAL_EMAIL_IN_USE", "Personal email is already in use.");
      }
      throw error;
    }
  }
}
