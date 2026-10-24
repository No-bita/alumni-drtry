import { describe, expect, it } from "vitest";
import { hasMinimumProfile, canAccessOnboardingFlow, shouldUseOnboardingFlow } from "../../src/lib/onboardingEligibility";
import { cohortLabelFromProfile, firstNameForGreeting } from "../../src/lib/onboardingDisplay";
const ready = { fullName: "Asha Rao", departmentCode: "cse", degreeCode: "btech", batchYear: 2024 };
describe("minimum profile routing", () => {
  it("accepts all four required values without completion stamps", () => {
    expect(hasMinimumProfile(ready)).toBe(true);
    expect(shouldUseOnboardingFlow(ready)).toBe(false);
  });
  it.each(["fullName", "departmentCode", "degreeCode", "batchYear"])("requires %s", (key) => {
    expect(hasMinimumProfile({ ...ready, [key]: null })).toBe(false);
  });
  it.each([null, 0, 1, 2, 3, 9, Number.NaN])("never uses login count %s as completion", (appLoginCount) => {
    const incomplete = { fullName: "Asha", appLoginCount };
    expect(canAccessOnboardingFlow(incomplete)).toBe(true);
  });
  it.each([1959, 2024.5, Number.NaN, new Date().getFullYear() + 6])("rejects invalid graduation year %s", (batchYear) => {
    expect(hasMinimumProfile({ ...ready, batchYear })).toBe(false);
  });
  it("rejects blank required strings", () => {
    expect(hasMinimumProfile({ ...ready, fullName: "  " })).toBe(false);
  });
});
describe("onboarding display", () => {
  it("builds cohort labels with department and batch", () => {
    expect(cohortLabelFromProfile({ departmentCode: "bme", batchYear: 2019 } as never)).toBe("Biomedical Engineering 2019");
    expect(cohortLabelFromProfile({ departmentCode: null, batchYear: 2019 } as never)).toBe("2019");
    expect(cohortLabelFromProfile({ departmentCode: "BME", batchYear: null } as never)).toBe("Biomedical Engineering");
    expect(cohortLabelFromProfile({ departmentCode: "zzz", batchYear: null } as never)).toBe("your batch");
  });
  it("greets by first name, falling back to the email", () => {
    expect(firstNameForGreeting("asha RAO", "x@y.in")).toBe("Asha");
    expect(firstNameForGreeting("", "meera.k@y.in")).toBe("Meera");
    expect(firstNameForGreeting(null, "")).toBe("There");
  });
});
