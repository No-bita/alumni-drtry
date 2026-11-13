import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { copy } from "../content/copy.ts";

test("search and link previews share the selected description", () => {
  assert.equal(copy.seo.description, "Alma Mater is a private members' community for the top institutions of India. Apply to become a member.");
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.equal((layout.match(/description: copy\.seo\.description/g) ?? []).length, 3);
});
