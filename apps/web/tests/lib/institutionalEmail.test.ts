import { describe, expect, it } from "vitest";
import { isInstitutionalEmail } from "../../src/lib/institutionalEmail";
describe("institution email feedback", () => {
  it.each(["asha@itbhu.ac.in", "asha@iitbhu.ac.in", " ASHA@IITBHU.AC.IN ", "asha@iitgn.ac.in", "asha@iitg.ac.in", " ASHA@IITG.AC.IN ", "asha@iiml.org.in"])("accepts %s", value => expect(isInstitutionalEmail(value)).toBe(true));
  it.each(["", "@itbhu.ac.in", "asha@@itbhu.ac.in", "asha@x.itbhu.ac.in", "asha@itbhu.ac.in.evil.com", "asha@evil-itbhu.ac.in", "asha @itbhu.ac.in", "asha@gmail.com", "asha@x.iitg.ac.in", "asha@iitg.ac.in.evil.com", "asha@iitgn.ac.in.evil.com", "asha@eviliitg.ac.in", "asha@iitd.ac.in", "asha@x.iiml.org.in", "asha@iiml.org.in.evil.com"])("rejects %s", value => expect(isInstitutionalEmail(value)).toBe(false));
});
