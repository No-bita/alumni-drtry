import { describe, expect, it } from "vitest";
import { isBhuInstitutionalEmail } from "./domainAllowlist.js";
import { parseInstitutionalIdentity } from "./emailParser.js";

describe("isBhuInstitutionalEmail", () => {
  it("accepts both BHU domains", () => {
    expect(isBhuInstitutionalEmail("arjun.cse20@iitbhu.ac.in")).toBe(true);
    expect(isBhuInstitutionalEmail("arjun.cse20@itbhu.ac.in")).toBe(true);
  });

  it("rejects other allowed institutes and malformed values", () => {
    expect(isBhuInstitutionalEmail("aarav.mehta@iitgn.ac.in")).toBe(false);
    expect(isBhuInstitutionalEmail("aarav.mehta@iitg.ac.in")).toBe(false);
    expect(isBhuInstitutionalEmail("not-an-email")).toBe(false);
    expect(isBhuInstitutionalEmail("")).toBe(false);
  });
});

describe("parseInstitutionalIdentity", () => {
  it("parses BHU dotted locals (dept + year + names)", () => {
    const parsed = parseInstitutionalIdentity("arjun.kumar.cse20@iitbhu.ac.in");
    expect(parsed.departmentCode).toBe("cse");
    expect(parsed.joiningYear).toBe(2020);
    expect(parsed.parsedFirstName).toBe("arjun");
    expect(parsed.parsedLastName).toBe("kumar");
  });

  it("maps legacy BHU aliases", () => {
    const parsed = parseInstitutionalIdentity("arjun.me24@itbhu.ac.in");
    expect(parsed.departmentCode).toBe("mech");
    expect(parsed.joiningYear).toBe(2024);
  });

  it("keeps the BHU name-only fallback unchanged", () => {
    const parsed = parseInstitutionalIdentity("arjun@iitbhu.ac.in");
    expect(parsed.departmentCode).toBe("arjun");
    expect(parsed.joiningYear).toBeNull();
  });

  it("infers nothing for non-BHU name-only locals", () => {
    const parsed = parseInstitutionalIdentity("aarav.mehta@iitgn.ac.in");
    expect(parsed.normalizedEmail).toBe("aarav.mehta@iitgn.ac.in");
    expect(parsed.departmentCode).toBeNull();
    expect(parsed.departmentName).toBeNull();
    expect(parsed.joiningYear).toBeNull();
    expect(parsed.parsedFirstName).toBeNull();
    expect(parsed.parsedLastName).toBeNull();
  });

  it("infers nothing for non-BHU locals with trailing digits", () => {
    const parsed = parseInstitutionalIdentity("aarav.mehta24@iitg.ac.in");
    expect(parsed.departmentCode).toBeNull();
    expect(parsed.joiningYear).toBeNull();
  });

  it("infers nothing for non-BHU locals that look like the BHU pattern", () => {
    const parsed = parseInstitutionalIdentity("aarav.cse20@iitgn.ac.in");
    expect(parsed.departmentCode).toBeNull();
    expect(parsed.joiningYear).toBeNull();
  });
});
