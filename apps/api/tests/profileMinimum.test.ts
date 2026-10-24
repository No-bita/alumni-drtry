import { describe, expect, it, vi } from "vitest";
import { ProfileService } from "../src/services/profileService.js";
const ready = { id: "person", institutionalEmail: "asha@iitbhu.ac.in", fullName: "Asha", departmentCode: "cse", degreeCode: "btech", batchYear: 2020, onboardingCompletedAt: null, profileCompletedAt: null };
function service(overrides = {}, ids = { departmentId: "dept", degreeId: "degree" }) {
  const value = new ProfileService({} as never);
  const repo = (value as any).personRepo;
  vi.spyOn(repo, "findProfileById").mockResolvedValue({ ...ready, ...overrides });
  vi.spyOn(repo, "findProfileIdsById").mockResolvedValue(ids);
  const update = vi.spyOn(repo, "updateProfile").mockImplementation(async (input: any) => ({ ...ready, ...input }));
  return { value, update };
}
describe("fresh-member minimum", () => {
  it("completes with the four minimum fields and no optional data", async () => {
    const { value, update } = service();
    await value.updateMyProfile("person", { markMinimumProfileComplete: true });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ profileCompletedAt: expect.any(Date) }));
  });
  it.each([{ fullName: " " }, { batchYear: null }, { batchYear: 2020.5 }])("rejects incomplete minimum %j", async (overrides) => {
    const { value, update } = service(overrides);
    await expect(value.updateMyProfile("person", { markMinimumProfileComplete: true })).rejects.toMatchObject({ code: "PROFILE_MINIMUM_INCOMPLETE" });
    expect(update).not.toHaveBeenCalled();
  });
  it.each([{ departmentId: null, degreeId: "degree" }, { departmentId: "dept", degreeId: null }])("requires valid stored department and degree %j", async (ids) => {
    const { value, update } = service({}, ids as any);
    await expect(value.updateMyProfile("person", { markMinimumProfileComplete: true })).rejects.toMatchObject({ code: "PROFILE_MINIMUM_INCOMPLETE" });
    expect(update).not.toHaveBeenCalled();
  });
  it("does not trust an old minimum timestamp instead of actual fields", async () => {
    const { value, update } = service({ profileCompletedAt: new Date(), batchYear: null });
    await expect(value.updateMyProfile("person", { markOnboardingComplete: true })).rejects.toMatchObject({ code: "PROFILE_ONBOARDING_ORDER" });
    expect(update).not.toHaveBeenCalled();
  });
});
