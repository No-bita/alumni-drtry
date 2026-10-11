import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("career flow dialog scroll", () => {
  it("bounds the dialog height and scrolls its content", () => {
    const css = readFileSync(resolve(__dirname, "../src/styles/career-hiring-flow-scroll.css"), "utf8");
    expect(css).toMatch(/\.career-hiring-flow__dialog\s*{[^}]*max-height:\s*calc\(100dvh/);
    expect(css).toMatch(/overflow-y:\s*auto/);
  });
});
