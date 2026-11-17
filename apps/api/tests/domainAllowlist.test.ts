import { describe, expect, it } from "vitest";
import { DOMAIN_DIRECTORY, isInstitutionalEmailAllowed, normalizeEmail, parseAllowedDomains } from "../src/lib/domainAllowlist.js";

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

  it("accepts the newly enabled institute and alumni-association domains", () => {
    const allowlist = parseAllowedDomains("iitbhu.ac.in,itbhu.ac.in,iitb.ac.in,iitbombay.org,iima.ac.in,iitg.ac.in,iitgn.ac.in");
    expect(isInstitutionalEmailAllowed("student@iitb.ac.in", allowlist)).toBe(true);
    expect(isInstitutionalEmailAllowed("alumnus@iitbombay.org", allowlist)).toBe(true);
    expect(isInstitutionalEmailAllowed("member@iima.ac.in", allowlist)).toBe(true);
    expect(isInstitutionalEmailAllowed("member@iitg.ac.in", allowlist)).toBe(true);
    expect(isInstitutionalEmailAllowed("member@iitgn.ac.in", allowlist)).toBe(true);
  });

  it("organizes domains by institution and domain type without labelling members", () => {
    expect(DOMAIN_DIRECTORY["iitb.ac.in"]).toEqual({ institution: "IIT Bombay", type: "institute" });
    expect(DOMAIN_DIRECTORY["iitbombay.org"]).toEqual({ institution: "IIT Bombay", type: "alumni-association" });
    expect(DOMAIN_DIRECTORY["iima.ac.in"]).toEqual({ institution: "IIM Ahmedabad", type: "institute" });
    expect(DOMAIN_DIRECTORY["iitg.ac.in"]).toEqual({ institution: "IIT Guwahati", type: "institute" });
    expect(DOMAIN_DIRECTORY["iitgn.ac.in"]).toEqual({ institution: "IIT Gandhinagar", type: "institute" });
  });
});

