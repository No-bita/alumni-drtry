import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { contrastRatio } from "../lib/contrast.ts";
import { colors, HAND_MIN_PX, RULE_SPACING_PX } from "../lib/tokens.ts";

const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

test("every colour token in tokens.ts is defined in globals.css @theme with the same hex", () => {
  for (const [name, hex] of Object.entries(colors)) {
    const re = new RegExp(`--color-${name}:\\s*${hex};`, "i");
    assert.match(css, re, `missing or different: --color-${name}: ${hex}`);
  }
});

test("globals.css defines no extra colour tokens", () => {
  const defined = [...css.matchAll(/--color-([a-z-]+):/g)].map((m) => m[1]);
  assert.deepEqual(defined.sort(), Object.keys(colors).sort());
});

test("text colours reach WCAG AA (4.5:1) on paper and card", () => {
  for (const fg of ["ink", "pen-blue", "stamp-red", "label"] as const) {
    for (const bg of ["paper", "card"] as const) {
      const ratio = contrastRatio(colors[fg], colors[bg]);
      assert.ok(ratio >= 4.5, `${fg} on ${bg} is ${ratio.toFixed(2)}`);
    }
  }
  assert.ok(contrastRatio(colors.paper, colors.ink) >= 4.5, "paper on ink buttons and header bars");
});

test("ruled paper uses a 36px rhythm and a 0.09 blue rule", () => {
  assert.equal(RULE_SPACING_PX, 36);
  assert.match(css, /transparent 35px/);
  assert.match(css, /rgba\(31, 63, 168, 0\.09\) 36px/);
});

test("the only gradient in the CSS is the ruled background", () => {
  const gradients = css.match(/gradient\(/g) ?? [];
  assert.equal(gradients.length, 1);
  assert.doesNotMatch(css, /box-shadow|drop-shadow/);
});

test("handwriting minimum is 24px", () => {
  assert.equal(HAND_MIN_PX, 24);
});

test("reduced motion is respected globally", () => {
  assert.match(css, /prefers-reduced-motion: reduce/);
});
