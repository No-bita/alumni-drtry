import { describe, expect, it } from "vitest";
import { findTourTarget, placeTour, type TourRect } from "../src/lib/demoTourPosition";

const rect: TourRect = { left: 100, top: 120, right: 500, bottom: 180, width: 400, height: 60 };
describe("demo tour positioning", () => {
  it("anchors below an available target", () => {
    expect(placeTour(rect, 340, 240, { width: 1024, height: 768 }, 60)).toMatchObject({ top: 194, side: "top" });
  });
  it("uses the space above a low target", () => {
    expect(placeTour({ ...rect, top: 600, bottom: 660 }, 340, 240, { width: 1024, height: 768 }, 60)).toMatchObject({ top: 346, side: "bottom" });
  });
  it("falls back without a pointer when the target is missing or offscreen", () => {
    for (const target of [null, { ...rect, top: 900, bottom: 960 }]) {
      expect(placeTour(target, 340, 240, { width: 1024, height: 768 }, 60)).toMatchObject({ top: 60, side: null });
    }
  });
  it("clamps a mobile card inside the viewport", () => {
    const p = placeTour({ ...rect, left: 0, right: 390 }, 358, 260, { width: 390, height: 750 }, 90);
    expect(p.left).toBe(16);
    expect(p.top).toBeGreaterThanOrEqual(90);
    expect(p.top + 260).toBeLessThanOrEqual(734);
  });
  it("avoids covering a full-height target when there is space beside it", () => {
    expect(placeTour({ left: 30, right: 200, top: 70, bottom: 700, width: 170, height: 630 }, 340, 240, { width: 1024, height: 768 }, 60).side).toBe("left");
  });
  it("ignores navigation and the viewer's own profile", () => {
    document.body.innerHTML = '<nav><a href="/profiles/nav">Nav</a></nav><a href="/profiles/me">Me</a><a href="/profiles/demo">Demo alum</a>';
    document.querySelectorAll('a').forEach((el) => { el.getBoundingClientRect = () => ({ ...rect, x: rect.left, y: rect.top, toJSON: () => ({}) }); });
    expect(findTourTarget("profile", "me")?.getAttribute("href")).toBe("/profiles/demo");
    document.body.innerHTML = "";
  });
});
