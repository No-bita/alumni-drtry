import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileService } from "../src/services/profileService.js";
import { AppError } from "../src/lib/errors.js";
import type { PersonProfileView } from "../src/repos/personRepo.js";

// Members who pick "Other" as their department must specify it in their own words
// (1-80 chars plain text). The specification stays editable after onboarding while the
// department choice itself remains frozen. An empty value never silently clears saved text.

describe("ProfileService - department Other specification", () => {
  let mockPool: any;
  let mockClient: any;
  let profileService: ProfileService;

  const mockOtherProfile: PersonProfileView = {
    id: "person-123",
    institutionalEmail: "aaryan@iitbhu.ac.in",
    role: "alumni",
    fullName: "Aaryan Shah",
    departmentCode: "other",
    departmentName: "Other",
    departmentOtherText: null,
    departmentOtherStatus: "approved",
    departmentOtherRejectionReason: null,
    parsedDepartmentCode: "other",
    parsedDepartmentName: "Other",
    batchYear: 2020,
    parsedJoiningYear: 2016,
    degreeCode: "btech",
    degreeName: "Bachelor of Technology",
    personalEmail: null,
    bio: null,
    mobilePhone: null,
    residenceCountry: null,
    residenceCity: null,
    openToPreferences: null,
    profileCompletedAt: null,
    onboardingCompletedAt: null,
    appLoginCount: 1,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
  };

  beforeEach(() => {
    mockClient = { query: vi.fn(), release: vi.fn() };
    mockPool = { connect: vi.fn().mockResolvedValue(mockClient), query: vi.fn() };
    profileService = new ProfileService(mockPool);
  });

  function setupProfileMocks(currentProfile: PersonProfileView) {
    const personRepo = (profileService as any).personRepo;
    vi.spyOn(personRepo, "findProfileById").mockResolvedValue(currentProfile);
    vi.spyOn(personRepo, "findProfileIdsById").mockResolvedValue({
      departmentId: "dept-other-id",
      degreeId: "degree-btech-id",
    });
    const updateProfileSpy = vi.spyOn(personRepo, "updateProfile").mockImplementation(
      async (input: any) => ({ ...currentProfile, ...input })
    );
    return { updateProfileSpy };
  }

  it("saves the specification for an Other department during onboarding", async () => {
    const { updateProfileSpy } = setupProfileMocks(mockOtherProfile);

    const updated = await profileService.updateMyProfile("person-123", {
      departmentOtherText: "Applied Mechanics",
    });

    expect(updateProfileSpy).toHaveBeenCalledWith(
      expect.objectContaining({ departmentOtherText: "Applied Mechanics" })
    );
    expect(updated?.departmentOtherText).toBe("Applied Mechanics");
  });

  it("rejects saving Other without a specification", async () => {
    const { updateProfileSpy } = setupProfileMocks(mockOtherProfile);

    await expect(
      profileService.updateMyProfile("person-123", { departmentOtherText: "   " })
    ).rejects.toThrow(
      expect.objectContaining({ statusCode: 400, code: "PROFILE_INVALID_DEPARTMENT_OTHER_TEXT" })
    );
    expect(updateProfileSpy).not.toHaveBeenCalled();
  });

  it("rejects any profile write while an Other department has no specification", async () => {
    const { updateProfileSpy } = setupProfileMocks(mockOtherProfile);

    await expect(
      profileService.updateMyProfile("person-123", { bio: "hello" })
    ).rejects.toThrow(
      expect.objectContaining({ statusCode: 400, code: "PROFILE_INVALID_DEPARTMENT_OTHER_TEXT" })
    );
    expect(updateProfileSpy).not.toHaveBeenCalled();
  });

  it("rejects a specification over 80 characters", async () => {
    const { updateProfileSpy } = setupProfileMocks(mockOtherProfile);

    await expect(
      profileService.updateMyProfile("person-123", { departmentOtherText: "x".repeat(81) })
    ).rejects.toThrow(
      expect.objectContaining({ statusCode: 400, code: "PROFILE_INVALID_DEPARTMENT_OTHER_TEXT" })
    );
    expect(updateProfileSpy).not.toHaveBeenCalled();
  });

  it("lets a completed member edit the specification while the department stays frozen", async () => {
    const completed = {
      ...mockOtherProfile,
      departmentOtherText: "Applied Mechanics",
      profileCompletedAt: new Date("2024-01-01T00:00:00Z"),
      onboardingCompletedAt: new Date("2024-01-02T00:00:00Z"),
    };
    const { updateProfileSpy } = setupProfileMocks(completed);

    const updated = await profileService.updateMyProfile("person-123", {
      departmentOtherText: "Ceramic Engineering",
    });

    expect(updateProfileSpy).toHaveBeenCalledWith(
      expect.objectContaining({ departmentOtherText: "Ceramic Engineering" })
    );
    expect(updated?.departmentOtherText).toBe("Ceramic Engineering");

    await expect(
      profileService.updateMyProfile("person-123", { departmentCode: "cse" })
    ).rejects.toThrow(
      expect.objectContaining({ statusCode: 400, code: "PROFILE_FROZEN_FIELD" })
    );
  });

  it("never clears a saved specification with an empty value", async () => {
    const completed = {
      ...mockOtherProfile,
      departmentOtherText: "Applied Mechanics",
      profileCompletedAt: new Date("2024-01-01T00:00:00Z"),
      onboardingCompletedAt: new Date("2024-01-02T00:00:00Z"),
    };
    const { updateProfileSpy } = setupProfileMocks(completed);

    await expect(
      profileService.updateMyProfile("person-123", { departmentOtherText: "" })
    ).rejects.toThrow(
      expect.objectContaining({ statusCode: 400, code: "PROFILE_INVALID_DEPARTMENT_OTHER_TEXT" })
    );
    expect(updateProfileSpy).not.toHaveBeenCalled();
  });

  it("marks a changed specification as resubmitted for review", async () => {
    const completed = {
      ...mockOtherProfile,
      departmentOtherText: "Applied Mechanics",
      profileCompletedAt: new Date("2024-01-01T00:00:00Z"),
      onboardingCompletedAt: new Date("2024-01-02T00:00:00Z"),
    };
    const { updateProfileSpy } = setupProfileMocks(completed);

    await profileService.updateMyProfile("person-123", { departmentOtherText: "Ceramic Engineering" });
    expect(updateProfileSpy).toHaveBeenCalledWith(
      expect.objectContaining({ departmentOtherResubmitted: true })
    );
  });

  it("does not resubmit when the specification is unchanged or the department is not Other", async () => {
    const completed = {
      ...mockOtherProfile,
      departmentOtherText: "Applied Mechanics",
      profileCompletedAt: new Date("2024-01-01T00:00:00Z"),
      onboardingCompletedAt: new Date("2024-01-02T00:00:00Z"),
    };
    const { updateProfileSpy } = setupProfileMocks(completed);

    await profileService.updateMyProfile("person-123", { departmentOtherText: "Applied Mechanics" });
    expect(updateProfileSpy).toHaveBeenCalledWith(
      expect.objectContaining({ departmentOtherResubmitted: false })
    );

    const cseProfile: PersonProfileView = {
      ...completed,
      departmentCode: "cse",
      departmentName: "Computer Science and Engineering",
    };
    const { updateProfileSpy: cseSpy } = setupProfileMocks(cseProfile);
    await profileService.updateMyProfile("person-123", { bio: "hello" });
    expect(cseSpy).toHaveBeenCalledWith(expect.objectContaining({ departmentOtherResubmitted: false }));
  });

  it("ignores an empty specification for non-Other departments without touching storage", async () => {
    const cseProfile: PersonProfileView = {
      ...mockOtherProfile,
      departmentCode: "cse",
      departmentName: "Computer Science and Engineering",
    };
    const { updateProfileSpy } = setupProfileMocks(cseProfile);

    await profileService.updateMyProfile("person-123", { departmentOtherText: "" });

    expect(updateProfileSpy).toHaveBeenCalledWith(
      expect.objectContaining({ departmentOtherText: null })
    );
  });
});
