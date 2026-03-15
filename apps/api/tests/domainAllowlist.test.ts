import { describe, expect, it } from "vitest";
import { isInstitutionalEmailAllowed, normalizeEmail, parseAllowedDomains } from "../src/lib/domainAllowlist.js";

describe("domain allowlist", () => {
  it("accepts configured domains", () => {
    const allowlist = parseAllowedDomains("iitbhu.ac.in,itbhu.ac.in");
    expect(isInstitutionalEmailAllowed("student@iitbhu.ac.in", allowlist)).toBe(true);
    expect(isInstitutionalEmailAllowed("student@itbhu.ac.in", allowlist)).toBe(true);
  });

  it("rejects other domains", () => {
    const allowlist = parseAllowedDomains("iitbhu.ac.in,itbhu.ac.in");
    expect(isInstitutionalEmailAllowed("student@gmail.com", allowlist)).toBe(false);
  });

  it("normalizes case and trims", () => {
    expect(normalizeEmail("  TeSt@IITBHU.AC.IN ")).toBe("test@iitbhu.ac.in");
  });
});

