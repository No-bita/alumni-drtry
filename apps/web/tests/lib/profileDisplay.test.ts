import { describe, expect, it } from "vitest";
import {
  currentOccupation,
  formatOccupationCompanyTypeLine,
  formatOccupationDatesDurationLine,
  formatOccupationDuration,
  formatOccupationEmploymentLabel,
  formatOccupationMetaLine,
  formatOccupationPeriod,
  occupationWorkLocationLine,
  profileEducationHeadlineLine,
  residenceLine,
  roleOrgLineFromOccupation,
  roleOrgLineFromSearchProfile,
  roleOrgPartsFromOccupation,
  sortOccupationsForDisplay,
} from "../../src/lib/profileDisplay";

const occ = (o: Record<string, unknown> = {}) =>
  ({
    roleTitle: "Engineer",
    organizationName: "Acme",
    isCurrent: false,
    startDate: null,
    endDate: null,
    occupationTypeCode: "full_time_employment",
    occupationTypeName: "Full time",
    ...o,
  }) as never;

describe("occupation role lines", () => {
  it("prefers the current occupation, else the first", () => {
    const a = occ({ roleTitle: "A" });
    const b = occ({ roleTitle: "B", isCurrent: true });
    expect(currentOccupation([a, b])).toBe(b);
    expect(currentOccupation([a])).toBe(a);
    expect(currentOccupation([])).toBeNull();
  });
  it("builds role and org parts", () => {
    expect(roleOrgPartsFromOccupation(null)).toBeNull();
    expect(roleOrgPartsFromOccupation(occ({ roleTitle: "  " }))).toBeNull();
    expect(roleOrgPartsFromOccupation(occ({ organizationName: " " }))).toEqual({ role: "Engineer", org: null });
    expect(roleOrgLineFromOccupation(occ())).toBe("Engineer @ Acme");
    expect(roleOrgLineFromOccupation(occ({ organizationName: null }))).toBe("Engineer");
    expect(roleOrgLineFromOccupation(null)).toBeNull();
  });
  it("builds a headline from search profiles", () => {
    expect(roleOrgLineFromSearchProfile({ headlineRoleTitle: "PM", headlineOrganizationName: "Zed" } as never)).toBe("PM @ Zed");
    expect(roleOrgLineFromSearchProfile({ headlineRoleTitle: "PM", headlineOrganizationName: null } as never)).toBe("PM");
    expect(roleOrgLineFromSearchProfile({ headlineRoleTitle: null, headlineOrganizationName: "Zed" } as never)).toBeNull();
  });
});

describe("education and residence", () => {
  it("joins degree, department and batch", () => {
    expect(
      profileEducationHeadlineLine({ degreeCode: "btech", degreeName: "BTech", departmentCode: "civ", departmentName: "Civil Engineering", batchYear: 2022 } as never),
    ).toBe("BTech, Civil Engineering · Class of '22");
  });
  it("degrades gracefully", () => {
    expect(profileEducationHeadlineLine(null)).toBeNull();
    expect(profileEducationHeadlineLine({ degreeName: null, degreeCode: null, departmentName: null, departmentCode: null, batchYear: 2019 } as never)).toBe("Class of '19");
    expect(profileEducationHeadlineLine({ degreeName: "BTech", degreeCode: null, departmentName: null, departmentCode: null, batchYear: null } as never)).toBe("BTech");
    expect(profileEducationHeadlineLine({ degreeName: null, degreeCode: null, departmentName: null, departmentCode: "cse", batchYear: null } as never)).toBe("CSE");
    expect(profileEducationHeadlineLine({ degreeName: null, degreeCode: null, departmentName: null, departmentCode: null, batchYear: null } as never, "me")).toBe("ME");
  });
  it("formats residence", () => {
    expect(residenceLine("Pune", "India")).toBe("Pune, India");
    expect(residenceLine("Pune", null)).toBe("Pune");
    expect(residenceLine(" ", "India")).toBe("India");
    expect(residenceLine(null, undefined)).toBeNull();
  });
});

describe("occupation dates", () => {
  it("sorts current first, then most recent", () => {
    const old = occ({ roleTitle: "old", endDate: "2015-01-01", startDate: "2010-01-01" });
    const recent = occ({ roleTitle: "recent", endDate: "2020-01-01", startDate: "2016-01-01" });
    const cur = occ({ roleTitle: "cur", isCurrent: true, startDate: "2021-01-01" });
    expect(sortOccupationsForDisplay([old, cur, recent]).map((o: { roleTitle: string }) => o.roleTitle)).toEqual(["cur", "recent", "old"]);
  });
  it("formats periods", () => {
    expect(formatOccupationPeriod(occ({ startDate: "2023-06-15", isCurrent: true }))).toBe("Jun 2023 – Present");
    expect(formatOccupationPeriod(occ({ startDate: "2019-02-10", endDate: "2021-03-10" }))).toBe("Feb 2019 – Mar 2021");
    expect(formatOccupationPeriod(occ({ startDate: "2019-02-10" }))).toBe("Feb 2019");
    expect(formatOccupationPeriod(occ({ isCurrent: true }))).toBe("Present");
    expect(formatOccupationPeriod(occ())).toBe("—");
    expect(formatOccupationPeriod(occ({ startDate: "2019-xx" }))).toBe("2019");
  });
  it("computes durations", () => {
    const ref = new Date("2026-03-10T00:00:00Z");
    expect(formatOccupationDuration(occ({ isCurrent: true, startDate: "2025-03-01" }), ref)).toBe("1 yr");
    expect(formatOccupationDuration(occ({ isCurrent: true, startDate: "2023-01-01" }), ref)).toBe("3 yrs");
    expect(formatOccupationDuration(occ({ isCurrent: true, startDate: "2026-02-01" }), ref)).toBe("1 mo");
    expect(formatOccupationDuration(occ({ isCurrent: true, startDate: "2025-10-01" }), ref)).toBe("5 mos");
    expect(formatOccupationDuration(occ({ isCurrent: true, startDate: "2026-03-01" }), ref)).toBeNull();
    expect(formatOccupationDuration(occ({ startDate: "2020-01-01", endDate: "2019-01-01" }), ref)).toBeNull();
    expect(formatOccupationDuration(occ({ startDate: null, isCurrent: true }), ref)).toBeNull();
    expect(formatOccupationDuration(occ({ startDate: "2020-01-01", endDate: null }), ref)).toBeNull();
  });
  it("builds the composite lines", () => {
    expect(formatOccupationEmploymentLabel(occ())).toBe("Full-time");
    expect(formatOccupationEmploymentLabel(occ({ occupationTypeCode: "weird", occupationTypeName: " Gig " }))).toBe("Gig");
    expect(formatOccupationEmploymentLabel(occ({ occupationTypeCode: "weird", occupationTypeName: "" }))).toBeNull();
    expect(formatOccupationCompanyTypeLine(occ())).toBe("Acme · Full-time");
    expect(formatOccupationCompanyTypeLine(occ({ organizationName: null }))).toBe("Full-time");
    expect(formatOccupationDatesDurationLine(occ())).toBeNull();
    expect(formatOccupationDatesDurationLine(occ({ startDate: "2019-02-10", endDate: "2021-03-10" }))).toBe("Feb 2019 – Mar 2021 · 2 yrs");
    expect(formatOccupationMetaLine(occ({ startDate: "2019-02-10" }), " Pune ")).toBe("Feb 2019 · Pune");
    expect(formatOccupationMetaLine(occ({ startDate: "2019-02-10" }))).toBe("Feb 2019");
  });
  it("uses residence only for current roles", () => {
    expect(occupationWorkLocationLine(occ({ isCurrent: true }), { city: "Pune", country: "India" })).toBe("Pune, India");
    expect(occupationWorkLocationLine(occ({ isCurrent: false }), { city: "Pune" })).toBeNull();
    expect(occupationWorkLocationLine(occ({ isCurrent: true }), null)).toBeNull();
  });
});
