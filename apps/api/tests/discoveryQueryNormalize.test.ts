import { describe, expect, it } from "vitest";
import { normalizeDiscoveryQuery } from "../src/lib/discoveryQueryNormalize.js";

describe("normalizeDiscoveryQuery", () => {
  it("extracts batch year from q when batch unset", () => {
    const r = normalizeDiscoveryQuery({ q: "Jane 2019" });
    expect(r.batch).toBe(2019);
    expect(r.q).toBe("Jane");
    expect(r.meta.batchFromQuery).toBe(2019);
    expect(r.meta.applied).toBe(true);
  });

  it("extracts department code token", () => {
    const r = normalizeDiscoveryQuery({ q: "ada cse" });
    expect(r.dept).toBe("cse");
    expect(r.q).toBe("ada");
  });

  it("extracts known org alias", () => {
    const r = normalizeDiscoveryQuery({ q: "pm google" });
    expect(r.company).toBe("Google");
    expect(r.q).toBe("pm");
  });
});
