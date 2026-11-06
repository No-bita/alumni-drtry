import { describe, expect, it } from "vitest";
import type { DbExecutor } from "../db/types.js";
import { PersonRepo } from "./personRepo.js";

// people.department_code / department_name / joining_year hold signup-parser output.
// Inference is only defined for IIT (BHU) locals, so profile read paths must suppress
// those columns for other institutes: stale guesses stored before the gate must never
// surface as identity. The stored rows themselves are intentionally left untouched.

function stubRepo(row: Record<string, unknown>): PersonRepo {
  const db = {
    query: async () => ({ rows: [row], rowCount: 1 })
  } as unknown as DbExecutor;
  return new PersonRepo(db);
}

const baseRow = {
  id: "person-1",
  role: "alumni",
  full_name: "Aarav Mehta",
  department_code: "aarav",
  department_name: null,
  department_other_text: null,
  joining_year: 2024,
  batch_year: null,
  personal_email: null,
  bio: null,
  mobile_phone: null,
  residence_country: "",
  residence_city: "",
  open_to_preferences: null,
  profile_completed_at: null,
  onboarding_completed_at: null,
  app_login_count: 0,
  created_at: new Date("2026-01-01T00:00:00Z"),
  updated_at: new Date("2026-01-01T00:00:00Z"),
  department_vocab_code: null,
  department_vocab_name: null,
  degree_vocab_code: null,
  degree_vocab_name: null
};

describe("PersonRepo parsed-identity visibility", () => {
  it("suppresses stored parser guesses for non-BHU emails", async () => {
    const profile = await stubRepo({
      ...baseRow,
      institutional_email: "aarav.mehta@iitgn.ac.in"
    }).findProfileById("person-1");
    expect(profile?.parsedDepartmentCode).toBeNull();
    expect(profile?.parsedDepartmentName).toBeNull();
    expect(profile?.parsedJoiningYear).toBeNull();
  });

  it("keeps parsed identity visible for BHU emails with a recognised guess", async () => {
    const profile = await stubRepo({
      ...baseRow,
      institutional_email: "asha.rao.cse20@itbhu.ac.in",
      department_code: "cse",
      department_name: "Computer Science and Engineering",
      joining_year: 2020
    }).findProfileById("person-1");
    expect(profile?.parsedDepartmentCode).toBe("cse");
    expect(profile?.parsedDepartmentName).toBe("Computer Science and Engineering");
    expect(profile?.parsedJoiningYear).toBe(2020);
  });

  it("passes through unrecognised BHU guesses so the client vocab gate can reject the prefill", async () => {
    const profile = await stubRepo({
      ...baseRow,
      institutional_email: "asha.rao.xyz20@iitbhu.ac.in",
      department_code: "xyz"
    }).findProfileById("person-1");
    expect(profile?.parsedDepartmentCode).toBe("xyz");
    expect(profile?.parsedJoiningYear).toBe(2024);
  });

  it("suppresses stored parser guesses for non-BHU emails on the update read path", async () => {
    const profile = await stubRepo({
      ...baseRow,
      institutional_email: "aarav.mehta@iitgn.ac.in"
    }).updateProfile({
      personId: "person-1",
      fullName: "Aarav Mehta",
      departmentId: null,
      departmentOtherText: null,
      degreeId: null,
      batchYear: null,
      personalEmail: null,
      bio: null,
      mobilePhone: null,
      residenceCountry: "",
      residenceCity: "",
      openToPreferences: null,
      profileCompletedAt: null,
      onboardingCompletedAt: null
    });
    expect(profile?.parsedDepartmentCode).toBeNull();
    expect(profile?.parsedJoiningYear).toBeNull();
  });
});

describe("PersonRepo department Other specification", () => {
  it("maps department_other_text onto the profile view", async () => {
    const profile = await stubRepo({
      ...baseRow,
      institutional_email: "asha.rao@iitbhu.ac.in",
      department_vocab_code: "other",
      department_vocab_name: "Other",
      department_other_text: "Applied Mechanics"
    }).findProfileById("person-1");
    expect(profile?.departmentOtherText).toBe("Applied Mechanics");
  });

  it("passes the specification as the final update parameter and maps it on the way back", async () => {
    let capturedParams: unknown[] = [];
    const db = {
      query: async (_sql: string, params: unknown[]) => {
        capturedParams = params;
        return {
          rows: [{ ...baseRow, institutional_email: "asha.rao@iitbhu.ac.in", department_vocab_code: "other", department_vocab_name: "Other", department_other_text: "Ceramic Engineering" }],
          rowCount: 1
        };
      }
    } as unknown as DbExecutor;
    const profile = await new PersonRepo(db).updateProfile({
      personId: "person-1",
      fullName: "Asha Rao",
      departmentId: "dept-other-id",
      departmentOtherText: "Ceramic Engineering",
      degreeId: null,
      batchYear: null,
      personalEmail: null,
      bio: null,
      mobilePhone: null,
      residenceCountry: "",
      residenceCity: "",
      openToPreferences: null,
      profileCompletedAt: null,
      onboardingCompletedAt: null
    });
    expect(capturedParams[13]).toBe("Ceramic Engineering"); // $14
    expect(capturedParams[14]).toBe(false); // $15: no resubmit flag passed
    expect(profile?.departmentOtherText).toBe("Ceramic Engineering");
  });

  it("marks a resubmission with the review-reset flag as $15", async () => {
    let capturedParams: unknown[] = [];
    const db = {
      query: async (_sql: string, params: unknown[]) => {
        capturedParams = params;
        return {
          rows: [{ ...baseRow, institutional_email: "asha.rao@iitbhu.ac.in", department_vocab_code: "other", department_vocab_name: "Other", department_other_text: "Ceramic Engineering", department_other_status: "pending" }],
          rowCount: 1
        };
      }
    } as unknown as DbExecutor;
    await new PersonRepo(db).updateProfile({
      personId: "person-1",
      fullName: "Asha Rao",
      departmentId: "dept-other-id",
      departmentOtherText: "Ceramic Engineering",
      degreeId: null,
      batchYear: null,
      personalEmail: null,
      bio: null,
      mobilePhone: null,
      residenceCountry: "",
      residenceCity: "",
      openToPreferences: null,
      profileCompletedAt: null,
      onboardingCompletedAt: null,
      departmentOtherResubmitted: true
    });
    expect(capturedParams[14]).toBe(true);
  });
});
