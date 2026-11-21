import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { claimWarmup, WARMUP_STORAGE_KEY, WARMUP_WINDOW_MS } from "../lib/apiWarmup.ts";

test("same-tab claim suppresses landing/Login duplicates for ten minutes, not forever", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
  assert.equal(claimWarmup(storage, 1_000_000), true);
  assert.equal(claimWarmup(storage, 1_000_001), false);
  assert.equal(claimWarmup(storage, 1_000_000 + WARMUP_WINDOW_MS), true);
  assert.equal(values.get(WARMUP_STORAGE_KEY), "1600000");
});

test("missing, denied or malformed storage never blocks the landing", () => {
  assert.equal(claimWarmup(null), true);
  assert.equal(claimWarmup({ getItem() { throw Error("denied"); }, setItem() { throw Error("denied"); } }), true);
  assert.equal(claimWarmup({ getItem: () => "broken", setItem() {} }), true);
});

test("landing is client-only and invisible, no server or CTA readiness dependency", () => {
  const component = readFileSync("components/LandingApiWarmup.tsx", "utf8");
  assert.ok(component.startsWith('"use client"'));
  assert.ok(component.includes("useEffect"));
  assert.ok(component.includes("requestAnimationFrame"));
  assert.ok(component.includes("return null"));
  assert.ok(readFileSync("app/page.tsx", "utf8").includes("<LandingApiWarmup />"));
});

test("landing and Login use the same privacy and dedup contract, without host hardcoding", () => {
  const landing = readFileSync("lib/apiWarmup.ts", "utf8");
  const web = readFileSync("../web/src/lib/apiWarmup.ts", "utf8");
  for (const source of [landing, web]) {
    assert.ok(source.includes('"alma-api-warmup-v1"'));
    assert.ok(source.includes("10 * 60_000"));
    assert.ok(source.includes('credentials: "omit"'));
    assert.ok(source.includes('cache: "no-store"'));
    assert.ok(source.includes('referrerPolicy: "no-referrer"'));
    assert.ok(source.includes("65_000"));
    assert.ok(!source.includes("onrender.com"));
    assert.ok(!source.includes("setInterval"));
  }
});
