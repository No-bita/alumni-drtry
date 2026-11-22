import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileService, missingIdentityDetails } from "../src/services/profileService.js";
import type { PersonProfileView } from "../src/repos/personRepo.js";

/**
 * BUG-014: onboarding can't finish without the identity it asks for (name, department, degree,
 * graduation year), because those fields freeze once it's done. Server rule + database rule (073).
 */

const blank: PersonProfileView = {
  id: "person-1",
  institutionalEmail: "member@iitbhu.ac.in",
  role: "alumni",
  fullName: null,
  departmentCode: null,
  departmentName: null,
  departmentOtherText: null,
  parsedDepartmentCode: null,
  parsedDepartmentName: null,
  batchYear: null,
  parsedJoiningYear: null,
  degreeCode: null,
  degreeName: null,
  personalEmail: null,
  bio: null,
  mobilePhone: null,
  residenceCountry: null,
  residenceCity: null,
  openToPreferences: null,
  profileCompletedAt: null,
  onboardingCompletedAt: null,
  appLoginCount: 1,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  updatedAt: new Date("2026-11-01T00:00:00Z")
} as PersonProfileView;

const filled: PersonProfileView = {
  ...blank,
  fullName: "Sample Member",
  departmentCode: "cse",
  departmentName: "Computer Science and Engineering",
  batchYear: 2024,
  degreeCode: "btech",
  degreeName: "BTech"
};

let service: ProfileService;
let update: ReturnType<typeof vi.fn>;

function setup(current: PersonProfileView, ids: { departmentId: string | null; degreeId: string | null }) {
  const pool = { connect: vi.fn(), query: vi.fn() };
  service = new ProfileService(pool as never);
  const repo = (service as unknown as { personRepo: Record<string, unknown> }).personRepo as Record<string, (...a: unknown[]) => unknown>;
  vi.spyOn(repo, "findProfileById" as never).mockResolvedValue(current as never);
  vi.spyOn(repo, "findProfileIdsById" as never).mockResolvedValue(ids as never);
  vi.spyOn(repo, "findDepartmentByCode" as never).mockImplementation((async (code: string) =>
    code === "other" ? { id: "dept-other", code: "other", name: "Other" } : { id: `dept-${code}`, code, name: code }) as never);
  vi.spyOn(repo, "findDegreeByCode" as never).mockImplementation((async (code: string) => ({ id: `deg-${code}`, code, name: code })) as never);
  update = vi.fn(async (input: Record<string, unknown>) => ({ ...current, ...input }));
  vi.spyOn(repo, "updateProfile" as never).mockImplementation(update as never);
}

beforeEach(() => vi.restoreAllMocks());

describe("finishing onboarding needs the full identity", () => {
  it("refuses the one-request shortcut with only a name, and writes nothing", async () => {
    setup(blank, { departmentId: null, degreeId: null });
    await expect(
      service.updateMyProfile("person-1", { fullName: "Sample Member", markMinimumProfileComplete: true, markOnboardingComplete: true })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "PROFILE_IDENTITY_INCOMPLETE",
      message: "Add your department, degree and graduation year before finishing your profile."
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses each completion flag on its own too", async () => {
    setup({ ...filled, batchYear: null }, { departmentId: "dept-cse", degreeId: "deg-btech" });
    await expect(service.updateMyProfile("person-1", { markMinimumProfileComplete: true })).rejects.toMatchObject({
      code: "PROFILE_IDENTITY_INCOMPLETE",
      message: "Add your graduation year before finishing your profile."
    });
    setup({ ...filled, profileCompletedAt: new Date() }, { departmentId: "dept-cse", degreeId: null });
    await expect(service.updateMyProfile("person-1", { markOnboardingComplete: true })).rejects.toMatchObject({
      code: "PROFILE_IDENTITY_INCOMPLETE",
      message: "Add your degree before finishing your profile."
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("completes when the details are already saved", async () => {
    setup(filled, { departmentId: "dept-cse", degreeId: "deg-btech" });
    await service.updateMyProfile("person-1", { markMinimumProfileComplete: true });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ profileCompletedAt: expect.any(Date) }));
  });

  it("completes when the same request supplies the missing details", async () => {
    setup(blank, { departmentId: null, degreeId: null });
    await service.updateMyProfile("person-1", {
      fullName: "Sample Member",
      departmentCode: "cse",
      degreeCode: "btech",
      batchYear: 2024,
      markMinimumProfileComplete: true,
      markOnboardingComplete: true
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ profileCompletedAt: expect.any(Date), onboardingCompletedAt: expect.any(Date) })
    );
  });

  it("re-sending a flag on a profile that's already complete isn't re-checked", async () => {
    setup({ ...filled, departmentCode: null, profileCompletedAt: new Date("2026-01-01"), onboardingCompletedAt: new Date("2026-01-02") }, {
      departmentId: null,
      degreeId: "deg-btech"
    });
    await service.updateMyProfile("person-1", { markOnboardingComplete: true });
    expect(update).toHaveBeenCalled();
  });
});

describe("missingIdentityDetails", () => {
  const all = { fullName: "A", departmentId: "d", departmentCode: "cse", departmentOtherText: null, degreeId: "g", batchYear: 2020 };
  it("lists what's missing, in onboarding's order", () => {
    expect(missingIdentityDetails(all)).toEqual([]);
    expect(missingIdentityDetails({ ...all, fullName: "  ", departmentId: null, degreeId: null, batchYear: null })).toEqual([
      "name",
      "department",
      "degree",
      "graduation year"
    ]);
  });
  it("an 'Other' department needs its typed name", () => {
    expect(missingIdentityDetails({ ...all, departmentCode: "other", departmentOtherText: " " })).toEqual(["department name"]);
    expect(missingIdentityDetails({ ...all, departmentCode: "other", departmentOtherText: "Ceramic Engineering" })).toEqual([]);
  });
});

describe("migration 073", () => {
  const sql = readFileSync(path.resolve(import.meta.dirname, "../src/db/migrations/073_people_identity_required_on_completion.sql"), "utf8");
  it("checks the moment a profile becomes complete, on insert or update, and nothing else", () => {
    expect(sql).toContain("BEFORE INSERT OR UPDATE OF profile_completed_at, onboarding_completed_at ON people");
    expect(sql).toContain("(TG_OP = 'INSERT' OR OLD.profile_completed_at IS NULL)");
    expect(sql).toContain("(TG_OP = 'INSERT' OR OLD.onboarding_completed_at IS NULL)");
    for (const rule of [
      "btrim(COALESCE(NEW.full_name, '')) = ''",
      "NEW.department_id IS NULL",
      "dept_code = 'other' AND btrim(COALESCE(NEW.department_other_text, '')) = ''",
      "NEW.degree_id IS NULL",
      "NEW.batch_year IS NULL"
    ]) {
      expect(sql).toContain(rule);
    }
    expect(sql).toContain("ERRCODE = 'check_violation'");
  });
});
