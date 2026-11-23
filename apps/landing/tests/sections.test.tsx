import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Footer } from "../components/Sections.tsx";
import { copy } from "../content/copy.ts";

const page = renderToStaticMarkup(<Footer />);

test("footer copy; contact email is a mailto link", () => {
  assert.ok(page.includes(copy.footer.tagline));
  assert.ok(page.includes(`href="mailto:${copy.footer.contactEmail}"`));
  assert.ok(!page.includes("PLACEHOLDER"));
});
