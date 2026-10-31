import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Home browse shortcut removal", () => {
  it("does not mount the redundant browse row, while keeping the component available", () => {
    const home = readFileSync("src/pages/Home.tsx", "utf8");
    expect(home).not.toContain("HomeBrowseRow");
    expect(home).toContain("<HomeOpportunityRail");
    expect(home).toContain("<HomeNetworkPanel");
    const browse = readFileSync("src/components/HomeBrowseRow.tsx", "utf8");
    expect(browse).toContain('aria-label="Browse"');
  });
});
