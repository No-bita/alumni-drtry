import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesDir = join(dirname(fileURLToPath(import.meta.url)), "../src/styles");

describe("mobile layout tokens", () => {
  it("defines phone gutter and applies it at 639px", () => {
    const tokens = readFileSync(join(stylesDir, "tokens.css"), "utf8");
    const base = readFileSync(join(stylesDir, "base.css"), "utf8");

    expect(tokens).toContain("--page-x-phone:");
    expect(base).toMatch(/@media \(max-width: 639px\)[\s\S]*--page-x: var\(--page-x-phone\)/);
  });

  it("documents phone breakpoint in UI contract", () => {
    const contract = readFileSync(join(stylesDir, "UI_CONTRACT.md"), "utf8");
    expect(contract).toContain("639px");
    expect(contract).toContain("--page-x-phone");
  });
});
