import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Cities parked email rollout", () => {
  it("does not run the retained city email machinery from production startup or reminder ticks", () => {
    const startup = readFileSync("src/index.ts", "utf8");
    expect(startup).not.toMatch(/\.sendNudges\s*\(/);
    expect(readFileSync("src/services/citiesService.ts", "utf8")).toContain("async sendNudges(");
  });
});

describe("city pages vs city emails", () => {
  it("page eligibility no longer reads the email eligibility list; nudges still do", () => {
    const source = readFileSync("src/services/citiesService.ts", "utf8");
    const isV1Body = source.match(/async isV1\([\s\S]*?\n  \}/)?.[0] ?? "";
    expect(isV1Body).not.toContain("v1PlaceIds");
    const nudgesBody = source.match(/async sendNudges\([\s\S]*$/)?.[0] ?? "";
    expect(nudgesBody).toContain("v1PlaceIds");
  });
});
