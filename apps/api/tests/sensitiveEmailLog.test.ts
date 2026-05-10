import { describe, expect, it } from "vitest";
import { emailFingerprintForLog } from "../src/lib/sensitiveEmailLog.js";

describe("emailFingerprintForLog", () => {
  it("is stable for the same normalized input", () => {
    const a = emailFingerprintForLog("person@itbhu.ac.in");
    const b = emailFingerprintForLog("person@itbhu.ac.in");
    expect(a).toBe(b);
    expect(a).toContain("domain:itbhu.ac.in");
    expect(a.startsWith("sha256:")).toBe(true);
  });

  it("does not echo the local part", () => {
    const fp = emailFingerprintForLog("secret-local@iitbhu.ac.in");
    expect(fp.toLowerCase()).not.toContain("secret");
    expect(fp).toContain("domain:iitbhu.ac.in");
  });
});
