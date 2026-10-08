import { describe, expect, it } from "vitest";
import { parseInstitutionalIdentity } from "../src/lib/emailParser.js";

describe("email parser", () => {
  it("extracts dept and year from dept-first local part", () => {
    const parsed = parseInstitutionalIdentity("cse20abc@iitbhu.ac.in");
    expect(parsed.departmentCode).toBe("cse");
    expect(parsed.departmentName).toBe("Computer Science and Engineering");
    expect(parsed.joiningYear).toBe(2020);
  });

  it("extracts dept and year from year-first local part", () => {
    const parsed = parseInstitutionalIdentity("21ece090@itbhu.ac.in");
    expect(parsed.departmentCode).toBe("ece");
    expect(parsed.departmentName).toBe("Electronics Engineering");
    expect(parsed.joiningYear).toBe(2021);
  });

  it("keeps unknown department code but still parses year", () => {
    const parsed = parseInstitutionalIdentity("xyz22foo@iitbhu.ac.in");
    expect(parsed.departmentCode).toBe("xyz");
    expect(parsed.departmentName).toBeNull();
    expect(parsed.joiningYear).toBe(2022);
  });

  it("parses firstname.deptyy (e.g. arjun.cse20)", () => {
    const parsed = parseInstitutionalIdentity("arjun.cse20@itbhu.ac.in");
    expect(parsed.parsedFirstName).toBe("arjun");
    expect(parsed.parsedLastName).toBeNull();
    expect(parsed.departmentCode).toBe("cse");
    expect(parsed.departmentName).toBe("Computer Science and Engineering");
    expect(parsed.joiningYear).toBe(2020);
  });

  it("parses firstname.lastname.deptyy", () => {
    const parsed = parseInstitutionalIdentity("arjun.kumar.cse20@iitbhu.ac.in");
    expect(parsed.parsedFirstName).toBe("arjun");
    expect(parsed.parsedLastName).toBe("kumar");
    expect(parsed.departmentCode).toBe("cse");
    expect(parsed.joiningYear).toBe(2020);
  });

  it("allows unknown long department only in a single segment (letters before first digit)", () => {
    const parsed = parseInstitutionalIdentity("biochemicalengineering25@iitbhu.ac.in");
    expect(parsed.parsedFirstName).toBeNull();
    expect(parsed.parsedLastName).toBeNull();
    expect(parsed.departmentCode).toBe("biochemicalengineering");
    expect(parsed.joiningYear).toBe(2025);
    expect(parsed.departmentName).toBeNull();
  });

  it("parses firstname.middlename.lastname.deptYY (e.g. MST)", () => {
    const parsed = parseInstitutionalIdentity("shahaaryan.milan.mst20@iitbhu.ac.in");
    expect(parsed.parsedFirstName).toBe("shahaaryan");
    expect(parsed.parsedLastName).toBe("milan");
    expect(parsed.departmentCode).toBe("mst");
    expect(parsed.departmentName).toBe("Material Sciences and Technology");
    expect(parsed.joiningYear).toBe(2020);
  });

  it("still parses year-first roll-style locals via legacy patterns", () => {
    const parsed = parseInstitutionalIdentity("21ece090@itbhu.ac.in");
    expect(parsed.departmentCode).toBe("ece");
    expect(parsed.joiningYear).toBe(2021);
    expect(parsed.parsedFirstName).toBeNull();
  });
});

