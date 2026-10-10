import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseInstitutionalEmailForOnboarding, toDisplayNamePart } from "../../src/lib/institutionalEmailParse";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-10T00:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("parseInstitutionalEmailForOnboarding", () => {
  it("parses firstname.lastname.deptYY", () => {
    const r = parseInstitutionalEmailForOnboarding("Rahul.Sharma.cse19@itbhu.ac.in");
    expect(r).toMatchObject({ firstName: "Rahul", lastName: "Sharma", departmentCode: "cse", joiningYear: 2019 });
    expect(r.departmentDisplayName).toBeTruthy();
  });
  it("parses firstname.deptYY with no last name", () => {
    const r = parseInstitutionalEmailForOnboarding("asha.cse2020@itbhu.ac.in");
    expect(r).toMatchObject({ firstName: "Asha", lastName: "", departmentCode: "cse", joiningYear: 2020 });
  });
  it("joins middle names into the first name", () => {
    const r = parseInstitutionalEmailForOnboarding("a.b.c.cse19@x.in");
    expect(r).toMatchObject({ firstName: "A B", lastName: "C" });
  });
  it("normalises legacy department aliases", () => {
    expect(parseInstitutionalEmailForOnboarding("x.y.me19@x.in").departmentCode).toBe("mech");
    expect(parseInstitutionalEmailForOnboarding("x.y.ce19@x.in").departmentCode).toBe("civil");
  });
  it("reads two-digit years around the current year", () => {
    expect(parseInstitutionalEmailForOnboarding("x.y.cse26@x.in").joiningYear).toBe(2026);
    expect(parseInstitutionalEmailForOnboarding("x.y.cse27@x.in").joiningYear).toBe(2027);
    expect(parseInstitutionalEmailForOnboarding("x.y.cse99@x.in").joiningYear).toBe(1999);
  });
  it("falls back to legacy layouts without a name", () => {
    expect(parseInstitutionalEmailForOnboarding("cse19rahul@x.in")).toMatchObject({ firstName: "", lastName: "", departmentCode: "cse", joiningYear: 2019 });
    expect(parseInstitutionalEmailForOnboarding("19cse@x.in")).toMatchObject({ departmentCode: "cse", joiningYear: 2019 });
    expect(parseInstitutionalEmailForOnboarding("cse2019@x.in")).toMatchObject({ departmentCode: "cse", joiningYear: 2019 });
  });
  it("returns blanks when nothing parses", () => {
    expect(parseInstitutionalEmailForOnboarding("hello@x.in")).toEqual({
      firstName: "",
      lastName: "",
      departmentCode: null,
      departmentDisplayName: null,
      joiningYear: null,
    });
  });
  it("rejects absurd years", () => {
    expect(parseInstitutionalEmailForOnboarding("x.y.cse1850@x.in").joiningYear).toBeNull();
  });
  it("title-cases name parts", () => {
    expect(toDisplayNamePart("aNU kUMAR")).toBe("Anu Kumar");
  });
});
