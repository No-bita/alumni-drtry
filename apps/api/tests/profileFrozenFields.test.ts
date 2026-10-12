import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileService, type UpdateMyProfileInput } from "../src/services/profileService.js";
import { AdminPeopleService } from "../src/services/adminPeopleService.js";
import { AppError } from "../src/lib/errors.js";
import type { PersonProfileView } from "../src/repos/personRepo.js";

describe("ProfileService - frozen identity fields guard", () => {
  let mockPool: any;
  let mockClient: any;
  let profileService: ProfileService;

  const mockCompletedProfile: PersonProfileView = {
    id: "person-123",
    institutionalEmail: "aaryan@iitbhu.ac.in",
    role: "alumni",
    fullName: "Aaryan Shah",
    departmentCode: "cse",
    departmentName: "Computer Science and Engineering",
    parsedDepartmentCode: "cse",
    parsedDepartmentName: "Computer Science and Engineering",
    batchYear: 2020,
    parsedJoiningYear: 2020,
    degreeCode: "btech",
    degreeName: "Bachelor of Technology",
    personalEmail: "aaryan.personal@example.com",
    bio: "Software Engineer",
    mobilePhone: "+919876543210",
    residenceCountry: "India",
    residenceCity: "Varanasi",
    openToPreferences: null,
    profileCompletedAt: new Date("2024-01-01T00:00:00Z"),
    onboardingCompletedAt: new Date("2024-01-02T00:00:00Z"),
    appLoginCount: 5,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-02T00:00:00Z"),
  };

  const mockIncompleteProfile: PersonProfileView = {
    ...mockCompletedProfile,
    onboardingCompletedAt: null,
    profileCompletedAt: null,
  };

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
      query: vi.fn(),
    };
    profileService = new ProfileService(mockPool);
  });

  function setupProfileMocks(currentProfile: PersonProfileView) {
    const personRepo = (profileService as any).personRepo;
    vi.spyOn(personRepo, "findProfileById").mockResolvedValue(currentProfile);
    vi.spyOn(personRepo, "findProfileIdsById").mockResolvedValue({
      departmentId: "dept-cse-id",
      degreeId: "degree-btech-id",
    });
    vi.spyOn(personRepo, "findDepartmentByCode").mockResolvedValue({
      id: "dept-cse-id",
      code: "cse",
      name: "Computer Science and Engineering",
    });
    vi.spyOn(personRepo, "findDegreeByCode").mockResolvedValue({
      id: "degree-btech-id",
      code: "btech",
      name: "Bachelor of Technology",
    });
    const updateProfileSpy = vi.spyOn(personRepo, "updateProfile").mockImplementation(
      async (input: any) => ({
        ...currentProfile,
        ...input,
      })
    );
    return { updateProfileSpy };
  }

  describe("when onboarding is completed (onboardingCompletedAt is set)", () => {
    it("rejects changed fullName and writes nothing", async () => {
      const { updateProfileSpy } = setupProfileMocks(mockCompletedProfile);

      await expect(
        profileService.updateMyProfile("person-123", { fullName: "New Different Name" })
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: "PROFILE_FROZEN_FIELD",
        })
      );

      expect(updateProfileSpy).not.toHaveBeenCalled();
    });

    it("rejects changed departmentCode and writes nothing", async () => {
      const { updateProfileSpy } = setupProfileMocks(mockCompletedProfile);

      await expect(
        profileService.updateMyProfile("person-123", { departmentCode: "ece" })
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: "PROFILE_FROZEN_FIELD",
        })
      );

      expect(updateProfileSpy).not.toHaveBeenCalled();
    });

    it("rejects changed degreeCode and writes nothing", async () => {
      const { updateProfileSpy } = setupProfileMocks(mockCompletedProfile);

      await expect(
        profileService.updateMyProfile("person-123", { degreeCode: "mtech" })
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: "PROFILE_FROZEN_FIELD",
        })
      );

      expect(updateProfileSpy).not.toHaveBeenCalled();
    });

    it("rejects changed batchYear and writes nothing", async () => {
      const { updateProfileSpy } = setupProfileMocks(mockCompletedProfile);

      await expect(
        profileService.updateMyProfile("person-123", { batchYear: 2021 })
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: "PROFILE_FROZEN_FIELD",
        })
      );

      expect(updateProfileSpy).not.toHaveBeenCalled();
    });

    it("rejects changed institutionalEmail and writes nothing", async () => {
      const { updateProfileSpy } = setupProfileMocks(mockCompletedProfile);

      await expect(
        profileService.updateMyProfile("person-123", { institutionalEmail: "other@iitbhu.ac.in" })
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: "PROFILE_FROZEN_FIELD",
        })
      );

      expect(updateProfileSpy).not.toHaveBeenCalled();
    });

    it("allows sending unchanged frozen fields", async () => {
      const { updateProfileSpy } = setupProfileMocks(mockCompletedProfile);

      const unchangedPayload: UpdateMyProfileInput = {
        fullName: "Aaryan Shah",
        departmentCode: "cse",
        degreeCode: "btech",
        batchYear: 2020,
        institutionalEmail: "aaryan@iitbhu.ac.in",
        bio: "Updated Bio",
      };

      const result = await profileService.updateMyProfile("person-123", unchangedPayload);

      expect(updateProfileSpy).toHaveBeenCalledTimes(1);
      expect(result.bio).toBe("Updated Bio");
    });

    it("keeps personalEmail editable", async () => {
      const { updateProfileSpy } = setupProfileMocks(mockCompletedProfile);

      const result = await profileService.updateMyProfile("person-123", {
        personalEmail: "new.personal@example.com",
      });

      expect(updateProfileSpy).toHaveBeenCalledTimes(1);
      expect(updateProfileSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          personalEmail: "new.personal@example.com",
        })
      );
      expect(result.personalEmail).toBe("new.personal@example.com");
    });
  });

  describe("when onboarding is not completed (onboardingCompletedAt is null)", () => {
    it("allows setting name, department, degree, and batch during onboarding", async () => {
      const { updateProfileSpy } = setupProfileMocks(mockIncompleteProfile);

      const onboardingPayload: UpdateMyProfileInput = {
        fullName: "Aaryan Shah First Setup",
        departmentCode: "cse",
        degreeCode: "btech",
        batchYear: 2020,
        markMinimumProfileComplete: true,
      };

      const result = await profileService.updateMyProfile("person-123", onboardingPayload);

      expect(updateProfileSpy).toHaveBeenCalledTimes(1);
      expect(updateProfileSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: "Aaryan Shah First Setup",
          departmentId: "dept-cse-id",
          degreeId: "degree-btech-id",
          batchYear: 2020,
        })
      );
      expect(result.fullName).toBe("Aaryan Shah First Setup");
    });

    it("rejects attempt to change institutional email even during onboarding", async () => {
      const { updateProfileSpy } = setupProfileMocks(mockIncompleteProfile);

      await expect(
        profileService.updateMyProfile("person-123", {
          institutionalEmail: "different@iitbhu.ac.in",
        })
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: "PROFILE_FROZEN_FIELD",
        })
      );

      expect(updateProfileSpy).not.toHaveBeenCalled();
    });
  });

  describe("admin path unaffected", () => {
    it("AdminPeopleService updates admin fields without touching profile frozen guards", async () => {
      const adminPeopleService = new AdminPeopleService(mockPool);
      const personRepo = (adminPeopleService as any).personRepo;

      vi.spyOn(personRepo, "findById").mockResolvedValue({
        id: "target-person-id",
        institutional_email: "alumni@iitbhu.ac.in",
        role: "alumni",
        is_test_user: false,
        is_demo: false,
        full_name: "Original Name",
        department_code: "cse",
        department_name: "CSE",
        department_id: null,
        degree_id: null,
        batch_year: 2020,
        personal_email: null,
        mobile_phone: null,
        bio: null,
        skills_text: null,
        residence_country: null,
        residence_city: null,
        profile_completed_at: new Date(),
        suspended_at: null,
        deleted_at: null,
        joining_year: 2020,
        app_login_count: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const updateAdminFieldsSpy = vi
        .spyOn(personRepo, "updateAdminFields")
        .mockResolvedValue({
          id: "target-person-id",
          institutional_email: "alumni@iitbhu.ac.in",
          role: "admin",
          is_test_user: false,
          is_demo: false,
          full_name: "Original Name",
          department_code: "cse",
          department_name: "CSE",
          department_id: null,
          degree_id: null,
          batch_year: 2020,
          personal_email: null,
          mobile_phone: null,
          bio: null,
          skills_text: null,
          residence_country: null,
          residence_city: null,
          profile_completed_at: new Date(),
          suspended_at: null,
          deleted_at: null,
          joining_year: 2020,
          app_login_count: 1,
          created_at: new Date(),
          updated_at: new Date(),
        });

      const result = await adminPeopleService.updatePerson(
        "target-person-id",
        { role: "admin" },
        "admin-actor-id"
      );

      expect(updateAdminFieldsSpy).toHaveBeenCalledWith("target-person-id", { role: "admin" });
      expect(result.role).toBe("admin");
      expect(result.fullName).toBe("Original Name");
    });
  });
});
