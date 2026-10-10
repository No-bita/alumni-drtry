import { describe, expect, it } from "vitest";
import { bubbleRadiusPx, mapPointForCity } from "../../src/lib/locationLensGeo";
import { mapIntentcastCategoryToHomeCategory, normalizeOpportunityCard } from "../../src/lib/intentcastOpportunityCard";
import { matchReasonLabel } from "../../src/lib/matchReasonLabels";

describe("mapPointForCity", () => {
  it("projects known cities, ignoring case and spacing", () => {
    const a = mapPointForCity(" PUNE ", "india");
    expect(a.xPct).toBeCloseTo(((73.86 + 180) / 360) * 100, 5);
    expect(a.yPct).toBeCloseTo(((90 - 18.52) / 180) * 100, 5);
  });
  it("treats Bangalore and Bengaluru the same", () => {
    expect(mapPointForCity("Bangalore", "India")).toEqual(mapPointForCity("Bengaluru", "India"));
  });
  it("falls back to the country centroid, then the map centre", () => {
    expect(mapPointForCity("Smallville", "India")).toEqual({ xPct: 71, yPct: 42 });
    expect(mapPointForCity("Nowhere", "Atlantis")).toEqual({ xPct: 50, yPct: 45 });
  });
});

describe("bubbleRadiusPx", () => {
  it("is 10 when there is no max", () => {
    expect(bubbleRadiusPx(3, 0)).toBe(10);
  });
  it("scales with the square root, from 8 to 44", () => {
    expect(bubbleRadiusPx(0, 100)).toBe(8);
    expect(bubbleRadiusPx(100, 100)).toBe(44);
    expect(bubbleRadiusPx(25, 100)).toBe(26);
    expect(bubbleRadiusPx(-5, 100)).toBe(8);
  });
});

describe("opportunity cards", () => {
  it("maps API categories to home lanes", () => {
    expect(mapIntentcastCategoryToHomeCategory("hiring" as never)).toBe("hiring");
    expect(mapIntentcastCategoryToHomeCategory("guidance" as never)).toBe("guidance");
    expect(mapIntentcastCategoryToHomeCategory("mentorship" as never)).toBe("careers");
    expect(mapIntentcastCategoryToHomeCategory("other" as never)).toBe("startups");
  });
  it("splits plain posts into a short title and summary", () => {
    const c = normalizeOpportunityCard("Looking for a flatmate in Pune\nTwo bedroom near Baner, available from May", "other" as never);
    expect(c.title.length).toBeLessThanOrEqual(72);
    expect(c.chips).toEqual([]);
  });
  it("flags relocation posts", () => {
    const c = normalizeOpportunityCard("Moving to Berlin next month, need housing tips", "other" as never);
    expect(c.category).toBe("relocation");
  });
  it("caps title and summary lengths", () => {
    const c = normalizeOpportunityCard(`${"T".repeat(200)}\n${"S".repeat(400)}`, "guidance" as never);
    expect(c.title.length).toBeLessThanOrEqual(72);
    expect(c.summary.length).toBeLessThanOrEqual(160);
    expect(c.category).toBe("guidance");
  });
  it("still labels match reasons", () => {
    expect(matchReasonLabel("same_department")).toBe("Same department");
  });
});
