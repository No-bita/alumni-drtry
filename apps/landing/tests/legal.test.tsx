import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LegalPage } from "../components/LegalPage.tsx";
import { legalPolicies } from "../content/legal.ts";

test("legal pages render reviewed sections, contact and cross-links", () => {
  for (const policy of ["privacy-policy", "terms-of-service"] as const) {
    const html = renderToStaticMarkup(<LegalPage policy={policy} />);
    assert.ok(html.includes(legalPolicies[policy].title));
    for (const section of legalPolicies[policy].sections) assert.ok(html.includes(section.heading));
    assert.ok(html.includes('href="/tos"'));
    assert.ok(html.includes('href="/privacy-policy"'));
    assert.ok(html.includes('href="mailto:aaryan@aaryanshah.co.in"'));
    assert.ok(!html.includes("review marker"));
  }
});
