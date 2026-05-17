import type { Pool } from "pg";
import { AppError } from "../lib/errors.js";
import { normalizeEmail } from "../lib/domainAllowlist.js";
import {
  normalizeOpenToPreferencesForStorage,
  parseOpenToPreferences,
  type OpenToPreferences,
} from "../lib/openToPreferences.js";
import { PersonRepo, type PersonProfileView } from "../repos/personRepo.js";

export interface UpdateMyProfileInput {
  fullName?: string;
  departmentCode?: string;
  batchYear?: number | null;
  degreeCode?: string | null;
  personalEmail?: string | null;
  bio?: string | null;
  mobilePhone?: string | null;
  residenceCountry?: string | null;
  residenceCity?: string | null;
  openToPreferences?: OpenToPreferences | null;
  /** Server sets `profile_completed_at` when name exists (minimum = end of onboarding step 2). */
  markMinimumProfileComplete?: true;
  /** Server sets `onboarding_completed_at` when minimum profile already exists (ideal = all steps). */
  markOnboardingComplete?: true;
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
    let nextMobilePhone = current.mobilePhone;
    let nextResidenceCountry = current.residenceCountry;
    let nextResidenceCity = current.residenceCity;
    let nextOpenToPreferences = current.openToPreferences;

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

    if (input.mobilePhone !== undefined) {
      nextMobilePhone =
        input.mobilePhone === null || input.mobilePhone.trim() === ""
          ? null
          : input.mobilePhone.trim();
    }

    if (input.residenceCountry !== undefined) {
      nextResidenceCountry =
        input.residenceCountry === null || input.residenceCountry.trim() === ""
          ? null
          : input.residenceCountry.trim();
    }

    if (input.residenceCity !== undefined) {
      nextResidenceCity =
        input.residenceCity === null || input.residenceCity.trim() === ""
          ? null
          : input.residenceCity.trim();
    }

    if (input.openToPreferences !== undefined) {
      if (input.openToPreferences === null) {
        nextOpenToPreferences = null;
      } else {
        const parsed = parseOpenToPreferences(input.openToPreferences);
        if (!parsed) {
          throw new AppError(400, "PROFILE_INVALID_OPEN_TO", "Invalid open-to preferences.");
        }
        nextOpenToPreferences = normalizeOpenToPreferencesForStorage(parsed);
      }
    }

    let nextProfileCompletedAt = current.profileCompletedAt;
    if (input.markMinimumProfileComplete === true) {
      if (!nextFullName?.trim()) {
        throw new AppError(
          400,
          "PROFILE_MINIMUM_INCOMPLETE",
          "Save your name and details (step 1) before completing this step."
        );
      }
      nextProfileCompletedAt = nextProfileCompletedAt ?? new Date();
    }

    let nextOnboardingCompletedAt = current.onboardingCompletedAt;
    if (input.markOnboardingComplete === true) {
      const hasMinimum =
        nextProfileCompletedAt != null || current.profileCompletedAt != null;
      if (!hasMinimum) {
        throw new AppError(
          400,
          "PROFILE_ONBOARDING_ORDER",
          "Complete earlier onboarding steps before marking the full funnel done."
        );
      }
      nextOnboardingCompletedAt = nextOnboardingCompletedAt ?? new Date();
    }

    try {
      return await this.personRepo.updateProfile({
        personId,
        fullName: nextFullName,
        departmentId: nextDepartmentId,
        degreeId: nextDegreeId,
        batchYear: nextBatchYear,
        personalEmail: nextPersonalEmail,
        bio: nextBio,
        mobilePhone: nextMobilePhone,
        residenceCountry: nextResidenceCountry,
        residenceCity: nextResidenceCity,
        openToPreferences: nextOpenToPreferences,
        profileCompletedAt: nextProfileCompletedAt,
        onboardingCompletedAt: nextOnboardingCompletedAt
      });
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new AppError(409, "PROFILE_PERSONAL_EMAIL_IN_USE", "Personal email is already in use.");
      }
      throw error;
    }
  }
}
