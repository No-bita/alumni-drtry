import { describe, expect, it } from "vitest";
import { computeTopicsFilterPlacement } from "../src/lib/topicsFilterPlacement";

const base = {
  viewportWidth: 390,
  viewportHeight: 844,
  bandTop: 0,
  naturalHeight: 198, // 4 topics x 46px + chrome
};

describe("computeTopicsFilterPlacement", () => {
  it("opens below when the list fits below", () => {
    const p = computeTopicsFilterPlacement({
      ...base,
      trigger: { top: 100, bottom: 144, left: 240, right: 340 },
      bandBottom: 844,
    });
    expect(p.side).toBe("below");
    expect(p.top).toBe(150); // trigger.bottom + gap
    expect(p.maxHeight).toBe(844 - 144 - 6);
  });

  it("flips above when only the space above fits the list", () => {
    const p = computeTopicsFilterPlacement({
      ...base,
      trigger: { top: 700, bottom: 744, left: 240, right: 340 },
      bandBottom: 752, // phone dock top edge
    });
    expect(p.side).toBe("above");
    expect(p.top).toBe(700 - 6 - 198);
    expect(p.top + 198).toBeLessThanOrEqual(700 - 6);
  });

  it("caps height toward the roomier side when neither side fits", () => {
    const p = computeTopicsFilterPlacement({
      ...base,
      viewportHeight: 300,
      trigger: { top: 140, bottom: 170, left: 240, right: 340 },
      bandBottom: 300,
      naturalHeight: 400, // long topic list
    });
    // spaceAbove = 140-0-6 = 134, spaceBelow = 300-170-6 = 124 -> above, capped
    expect(p.side).toBe("above");
    expect(p.maxHeight).toBe(134);
    expect(p.top).toBe(0); // clamped to bandTop
  });

  it("caps below when below is roomier, keeping clear of the dock", () => {
    const p = computeTopicsFilterPlacement({
      ...base,
      viewportHeight: 400,
      trigger: { top: 200, bottom: 244, left: 240, right: 340 },
      bandBottom: 292, // dock top edge on a short viewport
      naturalHeight: 400,
    });
    // spaceBelow = 292-244-6 = 42, spaceAbove = 200-0-6 = 194 -> above is roomier
    expect(p.side).toBe("above");
    expect(p.maxHeight).toBe(194);
  });

  it("respects the top toolbar band when opening upward", () => {
    const p = computeTopicsFilterPlacement({
      ...base,
      bandTop: 64,
      trigger: { top: 120, bottom: 164, left: 240, right: 340 },
      bandBottom: 260,
      viewportHeight: 300,
      naturalHeight: 400,
    });
    // spaceAbove = 120-64-6 = 50, spaceBelow = 260-164-6 = 90 -> below is roomier
    expect(p.side).toBe("below");
    expect(p.maxHeight).toBe(90);
    expect(p.top).toBe(170);
  });

  it("never returns a negative maxHeight on a tiny viewport", () => {
    const p = computeTopicsFilterPlacement({
      ...base,
      viewportHeight: 200,
      trigger: { top: 180, bottom: 224, left: 240, right: 340 },
      bandBottom: 150,
      naturalHeight: 198,
    });
    expect(p.maxHeight).toBeGreaterThanOrEqual(0);
  });

  it("right-aligns to the trigger and clamps into the viewport", () => {
    const wide = computeTopicsFilterPlacement({
      ...base,
      trigger: { top: 100, bottom: 144, left: 60, right: 390 },
      bandBottom: 844,
    });
    expect(wide.width).toBe(300);
    expect(wide.left).toBe(390 - 300 - 12); // clamped to the right edge allowance

    const narrow = computeTopicsFilterPlacement({
      ...base,
      viewportWidth: 320,
      trigger: { top: 100, bottom: 144, left: 200, right: 300 },
      bandBottom: 844,
    });
    expect(narrow.width).toBe(320 - 68); // 100vw - 68px floor preserved
    expect(narrow.left).toBe(300 - narrow.width);
  });
});
