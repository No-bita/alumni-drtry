import { describe, expect, it } from "vitest";
import { isInstitutionalEmail } from "../../src/lib/institutionalEmail";
describe("institution email feedback", () => {
  it.each(["asha@itbhu.ac.in", "asha@iitbhu.ac.in", " ASHA@IITBHU.AC.IN "])("accepts %s", value => expect(isInstitutionalEmail(value)).toBe(true));
  it.each(["", "@itbhu.ac.in", "asha@@itbhu.ac.in", "asha@x.itbhu.ac.in", "asha@itbhu.ac.in.evil.com", "asha@evil-itbhu.ac.in", "asha @itbhu.ac.in", "asha@gmail.com"])("rejects %s", value => expect(isInstitutionalEmail(value)).toBe(false));
});
