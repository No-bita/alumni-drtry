import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SITE_URL, PUBLIC_PATHS, parseSiteUrl } from "../lib/site.ts";

test("sitemap lists only the public landing pages", () => {
  assert.deepEqual([...PUBLIC_PATHS], ["/", "/privacy-policy", "/tos"]);
  for (const path of PUBLIC_PATHS) assert.ok(!path.startsWith("/app") && !path.startsWith("/preview"));
});

test("site url parsing accepts hosts and ignores junk", () => {
  assert.equal(parseSiteUrl("almamatter.in")?.origin, "https://almamatter.in");
  assert.equal(parseSiteUrl(" https://example.com ")?.origin, "https://example.com");
  assert.equal(parseSiteUrl(""), null);
  assert.equal(parseSiteUrl(undefined), null);
  assert.equal(new URL(DEFAULT_SITE_URL).origin, "https://almamatter.in");
});
