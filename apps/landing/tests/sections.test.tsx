import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BuildTogether, ExamCentres, Footer, ForAlumni, GapNote, HowItWorks, TaskWall } from "../components/Sections.tsx";
import { copy, PLATFORM_URL } from "../content/copy.ts";
import { taskWall } from "../content/taskWall.ts";

const page = renderToStaticMarkup(
  <>
    <GapNote />
    <TaskWall />
    <HowItWorks />
    <ForAlumni />
    <BuildTogether />
    <ExamCentres />
    <Footer />
  </>,
);

test("gap note shows heading, body and both contrast lines", () => {
  for (const s of [copy.gap.heading, copy.gap.body, copy.gap.contrastLeft]) assert.ok(page.includes(s));
  assert.ok(page.includes("Alma Mater: the one alum who’s done what you need"));
});

test("task wall renders all 12 questions in 3 sections", () => {
  for (const s of taskWall) {
    assert.ok(page.includes(s.title));
    for (const q of s.questions) assert.ok(page.includes(q.text));
  }
});

test("how it works has 3 steps, for alumni is the #for-alumni target", () => {
  for (const s of copy.howItWorks.steps) assert.ok(page.includes(s.title));
  assert.match(page, /<section id="for-alumni"/);
  assert.ok(!page.includes('id="waitlist"'), "waitlist placeholder section is gone");
  assert.ok(page.includes(copy.forAlumni.cta));
  assert.ok(page.includes(`href="${PLATFORM_URL}"`), "for-alumni CTA opens the platform");
});

test("build together, centres and footer copy; contact email is a mailto link", () => {
  for (const c of copy.buildTogether.cards) assert.ok(page.includes(c));
  for (const c of copy.examCentres.items) assert.ok(page.includes(c));
  assert.ok(page.includes(copy.footer.tagline));
  assert.ok(page.includes(`href="mailto:${copy.footer.contactEmail}"`));
  assert.ok(!page.includes("PLACEHOLDER"));
});

test("no slide or question counts in the page text", () => {
  assert.ok(!/\b(of 6|\d+ questions|\d+ slides)\b/i.test(page));
});
