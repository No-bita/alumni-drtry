import { afterEach, describe, expect, it } from "vitest";
import { findTourTarget, placeTour, tourMaxHeight, type TourRect } from "../src/lib/demoTourPosition";

const rect: TourRect = { left: 100, top: 120, right: 500, bottom: 180, width: 400, height: 60 };
describe("demo tour positioning", () => {
  afterEach(() => { document.body.innerHTML = ""; });
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
  it("selects a later visible profile instead of the first offscreen match", () => {
    document.body.innerHTML = '<a href="/profiles/offscreen">Offscreen</a><a href="/profiles/visible">Visible</a>';
    const links = document.querySelectorAll('a');
    links[0].getBoundingClientRect = () => ({ ...rect, top: 900, bottom: 960, x: 100, y: 900, toJSON: () => ({}) });
    links[1].getBoundingClientRect = () => ({ ...rect, x: 100, y: 120, toJSON: () => ({}) });
    expect(findTourTarget("profile", undefined, { width: 390, top: 90, bottom: 772 })?.getAttribute("href")).toBe("/profiles/visible");
    expect(findTourTarget("profile", undefined, { width: 390, top: 200, bottom: 772 })).toBeNull();
  });
  it("rejects targets outside any viewport edge but keeps partial intersections", () => {
    document.body.innerHTML = '<a href="/profiles/demo">Demo</a>';
    const el = document.querySelector('a')!;
    for (const bounds of [{ top: -60, bottom: 0 }, { top: 844, bottom: 904 }, { left: -400, right: 0 }, { left: 390, right: 790 }]) {
      el.getBoundingClientRect = () => ({ ...rect, ...bounds, x: 100, y: 120, toJSON: () => ({}) });
      expect(findTourTarget("profile", undefined, { width: 390, top: 0, bottom: 844 })).toBeNull();
    }
    el.getBoundingClientRect = () => ({ ...rect, top: -30, bottom: 30, x: 100, y: -30, toJSON: () => ({}) });
    expect(findTourTarget("profile", undefined, { width: 390, top: 0, bottom: 844 })).toBe(el);
  });
  it("caps the card to measured banner and dock space on short screens", () => {
    const height = tourMaxHeight(400, 90, 72);
    expect(height).toBe(222);
    const p = placeTour(null, 340, height, { width: 390, height: 328 }, 90);
    expect(p.top).toBe(90);
    expect(p.top + height).toBe(312);
    expect(tourMaxHeight(844, 90, 72)).toBe(666);
    expect(tourMaxHeight(400, 90)).toBe(294);
    expect(tourMaxHeight(100, 90, 72)).toBe(0);
  });
  it("ignores navigation and the viewer's own profile", () => {
    document.body.innerHTML = '<nav><a href="/profiles/nav">Nav</a></nav><a href="/profiles/me">Me</a><a href="/profiles/demo">Demo alum</a>';
    document.querySelectorAll('a').forEach((el) => { el.getBoundingClientRect = () => ({ ...rect, x: rect.left, y: rect.top, toJSON: () => ({}) }); });
    expect(findTourTarget("profile", "me")?.getAttribute("href")).toBe("/profiles/demo");
    document.body.innerHTML = "";
  });
});
