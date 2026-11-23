// Run: node --experimental-strip-types --test content/content.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { copy, PLATFORM_URL } from "./copy.ts";

test("no placeholders left in the copy", () => {
  assert.equal(copy.footer.contactEmail, "aaryan@aaryanshah.co.in");
  assert.ok(!JSON.stringify(copy).includes("PLACEHOLDER"));
  assert.equal(copy.seo.title, "Alma Mater — Find the alum who can help");
});

test("key copy matches spec", () => {
  assert.equal(PLATFORM_URL, "https://almamatter.in/app/login");
  assert.equal(copy.footer.tagline, "Made for alumni, by an alum.");
});

test("no emoji and no banned SaaS words in copy", () => {
  const all = JSON.stringify(copy);
  assert.ok(!/\p{Extended_Pictographic}/u.test(all));
  assert.ok(!/\b(unlock|empower|seamless)\w*/i.test(all));
});
