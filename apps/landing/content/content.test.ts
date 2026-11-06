// Run: node --experimental-strip-types --test content/content.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { heroPairs, HERO_PAIR_COUNT } from "./heroPairs.ts";
import { taskWall } from "./taskWall.ts";
import { copy, PLATFORM_URL } from "./copy.ts";

test("six hero pairs with sequential ids and complete fields", () => {
  assert.equal(heroPairs.length, HERO_PAIR_COUNT);
  assert.equal(HERO_PAIR_COUNT, 6);
  heroPairs.forEach((p, i) => {
    assert.equal(p.id, i + 1);
    assert.ok(!/\bQ\d\b/.test(p.pill), "pills show the topic only, no question number");
    for (const v of [p.useCase, p.headline, p.subhead, p.alum.name, p.alum.batchBranch, p.alum.currently, p.alum.whyThem]) {
      assert.ok(v.trim().length > 0);
    }
    assert.equal(p.alum.tags.length, 2);
  });
});

test("hero pair spec spot checks", () => {
  assert.equal(heroPairs[0].headline, "No one to refer you at your dream company?");
  assert.equal(heroPairs[3].alum.name, "Aditya Verma");
  assert.equal(heroPairs[5].alum.currently, "Data Scientist, Berlin");
  assert.equal(heroPairs[0].pill, "Referral");
  assert.equal(heroPairs[5].pill, "Relocation");
});

test("hero pain headlines and alumni names are unique", () => {
  assert.equal(new Set(heroPairs.map((p) => p.headline)).size, 6);
  assert.equal(new Set(heroPairs.map((p) => p.alum.name)).size, 6);
});

test("task wall has 3 sections and 12 numbered questions", () => {
  assert.deepEqual(taskWall.map((s) => s.id), ["A", "B", "C"]);
  const qs = taskWall.flatMap((s) => s.questions);
  assert.equal(qs.length, 12);
  assert.deepEqual(qs.map((q) => q.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(qs[11].text, "Pitch to alumni who invest.");
  taskWall.forEach((s) => assert.equal(s.questions.length, 4));
});

test("no placeholders left in the copy", () => {
  assert.equal(copy.footer.contactEmail, "aaryan@aaryanshah.co.in");
  assert.ok(!JSON.stringify(copy).includes("PLACEHOLDER"));
  assert.equal(copy.forAlumni.cta, "Join as an alum");
  assert.equal(copy.seo.title, "Alma Mater — Find the alum who can help");
});

test("key copy matches spec", () => {
  assert.equal(copy.nav.badge, "CENTRE: IIT (BHU) · NOW LIVE");
  assert.deepEqual(copy.hero.stamp, ["LIFE IS UNFAIR.", "USE YOUR UNFAIR ADVANTAGE."]);
  assert.equal(copy.nav.joinButton, "Open Alma Mater");
  assert.equal(copy.hero.primaryCta, "OPEN ALMA MATER");
  assert.equal(PLATFORM_URL, "https://app.almamater.aaryanshah.co.in/login");
  assert.equal(copy.forAlumni.anchorId, "for-alumni");
  assert.equal(copy.examCentres.items.length, 3);
  assert.equal(copy.howItWorks.steps.length, 3);
});

test("no invented numbers: gap contrast uses 1,000s", () => {
  assert.ok(copy.gap.contrastLeft.includes("1,000s"));
});

test("no emoji and no banned SaaS words in copy", () => {
  const all = JSON.stringify([copy, heroPairs, taskWall]);
  assert.ok(!/\p{Extended_Pictographic}/u.test(all));
  assert.ok(!/\b(unlock|empower|seamless)\w*/i.test(all));
});
