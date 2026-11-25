import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesDir = join(dirname(fileURLToPath(import.meta.url)), "../src/styles");

describe("broker card conversation link button", () => {
  it("keeps primary and secondary link buttons light-on-dark inside broker cards", () => {
    const broker = readFileSync(join(stylesDir, "broker.css"), "utf8");
    // `.broker-card a.btn { color: inherit }` beats the shared `.btn--*` text colors, so each
    // dark-filled variant needs its own light text override on link buttons.
    expect(broker).toMatch(/\.broker-card a\.btn--primary\s*\{[^}]*color:\s*#fff/);
    expect(broker).toMatch(/\.broker-card a\.btn--secondary\s*\{[^}]*color:\s*var\(--cream\)/);
  });
});
