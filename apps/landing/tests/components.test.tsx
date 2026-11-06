import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AdmitCard, CardField, PhotoBox } from "../components/AdmitCard.tsx";
import { Button } from "../components/Button.tsx";
import { CheckboxTag } from "../components/CheckboxTag.tsx";
import { Hand } from "../components/Hand.tsx";
import { clampStampRotation, Stamp } from "../components/Stamp.tsx";
import { initials } from "../lib/initials.ts";

test("initials: first and last name", () => {
  assert.equal(initials("Ananya Rao"), "AR");
  assert.equal(initials("  karan   singh mehta "), "KM");
  assert.equal(initials("Madonna"), "M");
  assert.equal(initials(""), "");
});

test("stamp rotation is clamped to -8..-4 degrees", () => {
  assert.equal(clampStampRotation(0), -4);
  assert.equal(clampStampRotation(-20), -8);
  assert.equal(clampStampRotation(-6), -6);
  const html = renderToStaticMarkup(<Stamp rotate={15}>Registered</Stamp>);
  assert.match(html, /rotate\(-4deg\)/);
  assert.match(html, /border-double/);
  assert.match(html, /border-\[3px\]/);
});

test("button renders a real <button> by default and a real <a> with href", () => {
  const b = renderToStaticMarkup(<Button>Join</Button>);
  assert.match(b, /^<button type="button"/);
  const a = renderToStaticMarkup(<Button href="#for-alumni">Join</Button>);
  assert.match(a, /^<a /);
  assert.match(a, /href="#for-alumni"/);
});

test("buttons have square corners and a 44px minimum touch target", () => {
  for (const variant of ["primary", "secondary"] as const) {
    const html = renderToStaticMarkup(<Button variant={variant}>Go</Button>);
    assert.match(html, /rounded-none/);
    assert.match(html, /min-h-11/);
  }
  assert.match(renderToStaticMarkup(<Button variant="link">Go</Button>), /min-h-11/);
});

test("primary is ink on paper, secondary is pen-blue fill", () => {
  assert.match(renderToStaticMarkup(<Button variant="primary">x</Button>), /bg-ink/);
  assert.match(renderToStaticMarkup(<Button variant="secondary">x</Button>), /bg-pen-blue/);
});

test("buttons have a visible focus style", () => {
  assert.match(renderToStaticMarkup(<Button>x</Button>), /focus-visible:outline-2/);
});

test("checkbox tag: label is real text, box is decorative", () => {
  const html = renderToStaticMarkup(<CheckboxTag label="Open to referrals" />);
  assert.match(html, /Open to referrals/);
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /<input/);
});

test("admit card has an ink header bar, 2px ink border and card surface", () => {
  const html = renderToStaticMarkup(
    <AdmitCard title="Alumni admit card">
      <dl>
        <CardField label="Name">Ananya Rao</CardField>
      </dl>
    </AdmitCard>,
  );
  assert.match(html, /border-2 border-ink bg-card/);
  assert.match(html, /bg-ink/);
  assert.match(html, /Alumni admit card/);
  assert.match(html, /<dt[^>]*>Name<\/dt>/);
});

test("photo box shows initials and has an accessible label", () => {
  const html = renderToStaticMarkup(<PhotoBox name="Ananya Rao" />);
  assert.match(html, />AR</);
  assert.match(html, /aria-label="Photo placeholder for Ananya Rao"/);
  assert.match(html, /bg-tint/);
});

test("handwriting is Caveat in pen-blue and never smaller than text-2xl (24px)", () => {
  const html = renderToStaticMarkup(<Hand>Someone from your college works there.</Hand>);
  assert.match(html, /font-hand/);
  assert.match(html, /text-pen-blue/);
  assert.match(html, /text-2xl/);
});
