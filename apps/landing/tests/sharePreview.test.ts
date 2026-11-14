import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { SHARE_PREVIEW_TITLE, copy } from "../content/copy.ts";

test("selected share heading is used for both social cards without changing page title", () => {
  assert.equal(SHARE_PREVIEW_TITLE, "Alma Mater - Life is unfair. Use your unfair advantage.");
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.equal((layout.match(/title: SHARE_PREVIEW_TITLE/g) ?? []).length, 2);
  assert.ok(layout.includes("title: copy.seo.title"));
  assert.equal(copy.seo.description, "Alma Mater is a private members' community for the top institutions of India. Apply to become a member.");
  assert.equal((layout.match(/description: copy\.seo\.description/g) ?? []).length, 3);
});

test("selected static image and accessible description stay in sync", () => {
  const image = readFileSync("app/opengraph-image.png");
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
  assert.ok(readFileSync("app/opengraph-image.alt.txt", "utf8").includes("Life is unfair. Use your unfair advantage."));
});
