import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";

const source = readFileSync("components/FourSectionLanding.tsx", "utf8");
const css = readFileSync("components/FourSectionLanding.css", "utf8");

test("home mounts the four-section review without old lower sections", () => {
  const page = readFileSync("app/page.tsx", "utf8");
  assert.ok(page.includes("<FourSectionLanding />"));
  for (const old of ["GapNote", "TaskWall", "HowItWorks", "BuildTogether", "ExamCentres"]) assert.ok(!page.includes(old));
  assert.equal((source.match(/<section /g) ?? []).length, 4);
  assert.equal((source.match(/<main>/g) ?? []).length, 1);
  assert.equal((source.match(/<h1 /g) ?? []).length, 1);
});

test("hero keeps the exact human support promise, not guaranteed matching", () => {
  assert.ok(source.includes("Life is unfair."));
  assert.ok(source.includes("Use your unfair"));
  assert.ok(source.includes("You don&apos;t have to figure it out alone."));
  assert.ok(source.includes("Ask someone who&apos;s been there."));
  for (const claim of ["We find the alum", "perfect person", "Most people never", "Get matched", "GET MATCHED"]) assert.ok(!source.includes(claim));
  assert.ok(source.includes("Alma Mater makes it easier to ask the community."));
});

test("the four contexts and reciprocity replace the twelve-item catalog", () => {
  for (const name of ["Work &amp; Careers", "Cities &amp; Local Life", "Business &amp; Startups", "Life &amp; Perspective"]) assert.ok(source.includes(`<h3>${name}</h3>`));
  assert.equal((source.match(/<article /g) ?? []).length, 4);
  assert.ok(source.includes("Someone might need"));
  assert.ok(source.includes("the answer you already have."));
  assert.ok(source.includes("Today, you ask. Tomorrow, someone asks you."));
  assert.ok(source.includes("All you have to do is ask."));
});

test("new section anchors, Join destination and legal links remain usable", () => {
  for (const id of ["problem", "contexts"]) {
    assert.ok(source.includes(`href="#${id}"`)); assert.ok(source.includes(`id="${id}"`));
  }
  assert.equal((source.match(/href=\{PLATFORM_URL\}/g) ?? []).length, 4);
  assert.ok(source.includes('href="/tos"')); assert.ok(source.includes('href="/privacy-policy"'));
  assert.ok(source.includes('aria-label="Main"'));
});

test("phone stacks cards and retains brand plus Join; palette is isolated from older pages", () => {
  assert.ok(css.includes("@media(max-width:900px)"));
  assert.ok(css.includes(".four-landing .context-grid{grid-template-columns:1fr"));
  assert.ok(css.includes(".four-landing .nav>a{display:none}"));
  assert.ok(css.includes("--paper:#fbf5e9"));
  assert.ok(css.includes("Georgia"));
  assert.ok(!css.includes("pen-blue")); assert.ok(!css.includes("repeating-linear-gradient"));
});

test("owner-supplied campus provenance is explicit and the supplied hero is preserved", () => {
  assert.ok(source.includes('data-design-status="review-only"'));
  assert.ok(source.includes('data-building-asset="owner-supplied-campus"'));
  assert.ok(css.includes("/human-reference-review.png"));
  assert.ok(css.includes("/four-section-campus.jpg"));
  assert.ok(existsSync("public/four-section-campus.jpg"));
  assert.ok(source.includes("Currently welcoming IIT (BHU) alumni. More institutions to come."));
});

test("targeted refinement keeps exact problem and reciprocity with consistent desktop Join", () => {
 assert.ok(source.includes("The hard part isn&apos;t having a network."));
 assert.ok(source.includes("It&apos;s knowing whom to ask."));
 assert.ok(source.includes("Have experience to share? Someone else might need it."));
 assert.ok(source.includes('className="join-full">Join Alma Mater'));
 assert.ok(source.includes('className="join-short">Join'));
});

test("search description uses the owner's exact selected positioning", () => {
 const copy = readFileSync("content/copy.ts", "utf8");
 const layout = readFileSync("app/layout.tsx", "utf8");
 assert.ok(copy.includes("Alma Mater is a private members' community for the top institutions of India. Apply to become a member."));
 assert.equal((layout.match(/description: copy\.seo\.description/g) ?? []).length, 3);
});
