import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isBhuInstitutionalEmail } from "../../src/lib/institutionalEmail";
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
    const r = parseInstitutionalEmailForOnboarding("a.b.c.cse19@itbhu.ac.in");
    expect(r).toMatchObject({ firstName: "A B", lastName: "C" });
  });
  it("normalises legacy department aliases", () => {
    expect(parseInstitutionalEmailForOnboarding("x.y.me19@itbhu.ac.in").departmentCode).toBe("mech");
    expect(parseInstitutionalEmailForOnboarding("x.y.ce19@itbhu.ac.in").departmentCode).toBe("civil");
  });
  it("reads two-digit years around the current year", () => {
    expect(parseInstitutionalEmailForOnboarding("x.y.cse26@itbhu.ac.in").joiningYear).toBe(2026);
    expect(parseInstitutionalEmailForOnboarding("x.y.cse27@itbhu.ac.in").joiningYear).toBe(2027);
    expect(parseInstitutionalEmailForOnboarding("x.y.cse99@itbhu.ac.in").joiningYear).toBe(1999);
  });
  it("falls back to legacy layouts without a name", () => {
    expect(parseInstitutionalEmailForOnboarding("cse19rahul@itbhu.ac.in")).toMatchObject({ firstName: "", lastName: "", departmentCode: "cse", joiningYear: 2019 });
    expect(parseInstitutionalEmailForOnboarding("19cse@itbhu.ac.in")).toMatchObject({ departmentCode: "cse", joiningYear: 2019 });
    expect(parseInstitutionalEmailForOnboarding("cse2019@itbhu.ac.in")).toMatchObject({ departmentCode: "cse", joiningYear: 2019 });
  });
  it("returns blanks when nothing parses", () => {
    expect(parseInstitutionalEmailForOnboarding("hello@itbhu.ac.in")).toEqual({
      firstName: "",
      lastName: "",
      departmentCode: null,
      departmentDisplayName: null,
      joiningYear: null,
    });
  });
  it("rejects absurd years", () => {
    expect(parseInstitutionalEmailForOnboarding("x.y.cse1850@itbhu.ac.in").joiningYear).toBeNull();
  });
  it("title-cases name parts", () => {
    expect(toDisplayNamePart("aNU kUMAR")).toBe("Anu Kumar");
  });
});

describe("non-BHU institutional emails (iitgn.ac.in, iitg.ac.in)", () => {
  it("identifies BHU vs other allowed domains", () => {
    expect(isBhuInstitutionalEmail("arjun.cse20@iitbhu.ac.in")).toBe(true);
    expect(isBhuInstitutionalEmail("arjun.cse20@itbhu.ac.in")).toBe(true);
    expect(isBhuInstitutionalEmail("aarav.mehta@iitgn.ac.in")).toBe(false);
    expect(isBhuInstitutionalEmail("aarav.mehta@iitg.ac.in")).toBe(false);
    expect(isBhuInstitutionalEmail("not-an-email")).toBe(false);
  });
  it("infers nothing for name-only locals", () => {
    expect(parseInstitutionalEmailForOnboarding("aarav.mehta@iitgn.ac.in")).toEqual({
      firstName: "",
      lastName: "",
      departmentCode: null,
      departmentDisplayName: null,
      joiningYear: null,
    });
  });
  it("infers nothing for locals with trailing digits", () => {
    const r = parseInstitutionalEmailForOnboarding("aarav.mehta24@iitg.ac.in");
    expect(r.departmentCode).toBeNull();
    expect(r.joiningYear).toBeNull();
  });
  it("infers nothing even when the local looks like the BHU pattern", () => {
    const r = parseInstitutionalEmailForOnboarding("aarav.cse20@iitgn.ac.in");
    expect(r.departmentCode).toBeNull();
    expect(r.departmentDisplayName).toBeNull();
    expect(r.joiningYear).toBeNull();
  });
});
