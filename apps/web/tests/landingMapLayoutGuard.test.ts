import { describe, expect, it } from "vitest";
import { rectsOverlap, resolveLandingMapCollisions, type LayoutRect } from "../src/lib/landingMapLayoutGuard";

function rect(
  left: number,
  top: number,
  width: number,
  height: number
): LayoutRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

describe("landingMapLayoutGuard", () => {
  it("detects overlapping rects with padding", () => {
    const a = rect(0, 0, 100, 100);
    const touching = rect(90, 90, 20, 20);
    const separated = rect(112, 0, 20, 20);
    const nearGap = rect(101, 0, 20, 20);
    expect(rectsOverlap(a, touching, 0)).toBe(true);
    expect(rectsOverlap(a, separated, 0)).toBe(false);
    expect(rectsOverlap(a, nearGap, 10)).toBe(true);
  });

  it("keeps dock at bottom when clear of obstacles", () => {
    const map = rect(500, 0, 400, 600);
    const dock = rect(520, 480, 280, 96);
    const card = rect(24, 520, 360, 200);

    const result = resolveLandingMapCollisions({
      mapRect: map,
      dockRect: dock,
      obstacles: [card],
    });

    expect(result.dockAnchor).toBe("bottom");
    expect(result.hadCollision).toBe(false);
  });

  it("moves dock to top when bottom overlaps sign-in card", () => {
    const map = rect(280, 0, 500, 500);
    const dock = rect(300, 380, 260, 100);
    const card = rect(24, 360, 400, 180);

    const result = resolveLandingMapCollisions({
      mapRect: map,
      dockRect: dock,
      obstacles: [card],
    });

    expect(result.dockAnchor).toBe("top");
    expect(result.pinLayerTopPx).toBeGreaterThan(0);
    expect(result.hadCollision).toBe(true);
  });
});
