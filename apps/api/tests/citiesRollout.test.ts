import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Cities parked email rollout", () => {
  it("does not run the retained city email machinery from production startup or reminder ticks", () => {
    const startup = readFileSync("src/index.ts", "utf8");
    expect(startup).not.toMatch(/\.sendNudges\s*\(/);
    expect(readFileSync("src/services/citiesService.ts", "utf8")).toContain("async sendNudges(");
  });
});
