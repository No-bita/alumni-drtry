import { describe, expect, it } from "vitest";
import { isTestInstitutionalEmail } from "./testUser.js";

describe("isTestInstitutionalEmail", () => {
  it("flags e2e test emails", () => {
    expect(isTestInstitutionalEmail("e2e-123@iitbhu.ac.in")).toBe(true);
    expect(isTestInstitutionalEmail("e2e-sea-1@iitbhu.ac.in")).toBe(true);
    expect(isTestInstitutionalEmail("E2E-foo@iitbhu.ac.in")).toBe(true);
  });

  it("does not flag demo-style local parts (no longer treated as test users)", () => {
    expect(isTestInstitutionalEmail("demo.alumni.alpha@itbhu.ac.in")).toBe(false);
  });

  it("does not flag normal alumni emails", () => {
    expect(isTestInstitutionalEmail("john.doe@itbhu.ac.in")).toBe(false);
    expect(isTestInstitutionalEmail("seed-admin-placeholder@example.invalid")).toBe(false);
  });
});
