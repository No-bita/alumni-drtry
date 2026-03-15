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
});

