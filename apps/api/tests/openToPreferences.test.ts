import { describe, expect, it } from "vitest";
import {
  OPEN_TO_MAX_SELECTED,
  normalizeOpenToPreferencesForStorage,
  parseOpenToPreferences,
} from "../src/lib/openToPreferences.js";

describe("api parseOpenToPreferences", () => {
  it("rejects null, primitives and arrays", () => {
    expect(parseOpenToPreferences(null)).toBeNull();
    expect(parseOpenToPreferences(undefined)).toBeNull();
    expect(parseOpenToPreferences("coffee")).toBeNull();
    expect(parseOpenToPreferences(["coffee"])).toBeNull();
  });
  it("drops unknown and duplicate ids and trims descriptions", () => {
    const r = parseOpenToPreferences({
      selected: ["coffee", "coffee", "bogus", 3, "intros"],
      descriptions: { coffee: "  tea ", bogus: "x", intros: 7 },
    });
    expect(r).toEqual({ selected: ["coffee", "intros"], descriptions: { coffee: "tea", intros: "" } });
  });
  it("returns null when nothing valid is selected", () => {
    expect(parseOpenToPreferences({ selected: [] })).toBeNull();
    expect(parseOpenToPreferences({ selected: ["bogus"] })).toBeNull();
  });
  it("reads the legacy enabled shape", () => {
    expect(
      parseOpenToPreferences({ coffee: { enabled: true, description: " hi " }, hiring: { enabled: false }, speaking: "x" }),
    ).toEqual({ selected: ["coffee"], descriptions: { coffee: "hi" } });
    expect(parseOpenToPreferences({ coffee: { enabled: false } })).toBeNull();
  });
});

describe("normalizeOpenToPreferencesForStorage", () => {
  it("caps the selection and description length", () => {
    const r = normalizeOpenToPreferencesForStorage({
      selected: ["referrals", "coffee", "mentorship", "hiring"],
      descriptions: { referrals: "x".repeat(800), hiring: "dropped" },
    });
    expect(r.selected).toHaveLength(OPEN_TO_MAX_SELECTED);
    expect(r.descriptions.referrals).toHaveLength(500);
    expect(r.descriptions.hiring).toBeUndefined();
  });
  it("stores an empty description for selected options without one", () => {
    expect(normalizeOpenToPreferencesForStorage({ selected: ["coffee"], descriptions: {} }).descriptions.coffee).toBe("");
  });
});
