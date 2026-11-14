import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

test("Direction 2 preserves chosen copy, links and supplied-image provenance", () => {
  const source = readFileSync("components/HumanHero.tsx", "utf8");
  assert.ok(source.includes("Life is unfair."));
  assert.ok(source.includes("Use your unfair"));
  assert.ok(source.includes("Find an alum who&apos;s done what you&apos;re trying to do."));
  assert.ok(source.includes("Exclusively for IITs and IIMs"));
  assert.ok(!source.includes("Soon for"));
  assert.ok(!source.includes("All you have to do"));
  assert.equal((source.match(/href=\{PLATFORM_URL\}/g) ?? []).length, 3);
  assert.ok(source.includes('aria-label="Main"'));
  assert.ok(source.includes('data-asset-status="supplied-image-crop"'));
  assert.ok(source.includes('href="#vision"'));
  assert.ok(source.includes('href="#how-heading"'));
});

test("Phone header keeps brand and Join without the second navigation row", () => {
  const css = readFileSync("components/HumanHero.css", "utf8");
  assert.ok(css.includes("@media(max-width:700px)"));
  assert.ok(css.includes(".human-nav{display:none}"));
  assert.ok(css.includes(".human-join"));
});
