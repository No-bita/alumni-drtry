import { describe, expect, it } from "vitest";
import { isInstitutionalEmail, isBhuInstitutionalEmail } from "../../src/lib/institutionalEmail";
describe("frontend email feedback", () => {
  it.each(["a@itbhu.ac.in", "a@iitbhu.ac.in", " A@IIML.ORG.IN ", "a@iitd.ac.in", "a@unknown-institute.edu", "a@dept.school.ac.in", "a@gmail.com.institute.edu", "a@outlook-custom.edu"])("passes valid unlisted domain %s", value => expect(isInstitutionalEmail(value)).toBe(true));
  it.each(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "yahoo.co.in", "yahoo.in", "yahoo.co.uk", "yahoo.fr", "ymail.com", "rocketmail.com", "icloud.com", "me.com", "mac.com", "aol.com", "aim.com", "proton.me", "protonmail.com", "pm.me", "protonmail.ch", "rediffmail.com"])("blocks personal provider %s", domain => {
    expect(isInstitutionalEmail(`a@${domain}`)).toBe(false);
    expect(isInstitutionalEmail(` A+tag@${domain.toUpperCase()} `)).toBe(false);
  });
  it.each(["", "@iitbhu.ac.in", "a@@iitbhu.ac.in", "a @iitbhu.ac.in", "a@", "a@localhost", "a@-school.edu", "a@school..edu", "a@school.edu.", "a@school .edu", "a@school.edu/anything"])("rejects malformed %s", value => expect(isInstitutionalEmail(value)).toBe(false));
  it("does not broaden BHU-specific parsing", () => {
    expect(isBhuInstitutionalEmail("a@itbhu.ac.in")).toBe(true);
    expect(isBhuInstitutionalEmail("a@iitbhu.ac.in")).toBe(true);
    expect(isBhuInstitutionalEmail("a@another.edu")).toBe(false);
  });
});
