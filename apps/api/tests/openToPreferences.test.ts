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
  it("drops unknown and duplicate ids, and ignores the removed per-tag lines", () => {
    const r = parseOpenToPreferences({
      selected: ["coffee", "coffee", "bogus", 3, "intros"],
      descriptions: { coffee: "  tea ", bogus: "x", intros: 7 },
    });
    expect(r).toEqual({ selected: ["coffee", "intros"] });
  });
  it("returns null when nothing valid is selected", () => {
    expect(parseOpenToPreferences({ selected: [] })).toBeNull();
    expect(parseOpenToPreferences({ selected: ["bogus"] })).toBeNull();
  });
  it("reads the legacy enabled shape", () => {
    expect(
      parseOpenToPreferences({ coffee: { enabled: true, description: " hi " }, hiring: { enabled: false }, speaking: "x" }),
    ).toEqual({ selected: ["coffee"] });
    expect(parseOpenToPreferences({ coffee: { enabled: false } })).toBeNull();
  });
});

describe("normalizeOpenToPreferencesForStorage", () => {
  it("caps the selection", () => {
    const r = normalizeOpenToPreferencesForStorage({
      selected: ["referrals", "coffee", "mentorship", "hiring", "advising", "speaking", "intros"],
    });
    expect(r.selected).toHaveLength(OPEN_TO_MAX_SELECTED);
  });
  it("stores only tags and the coffee limit, never per-tag lines", () => {
    expect(normalizeOpenToPreferencesForStorage({ selected: ["coffee"], limits: { coffee: 3 } })).toEqual({
      selected: ["coffee"],
      limits: { coffee: 3 },
    });
    const legacy = { selected: ["intros"], descriptions: { intros: "old line" } } as unknown as Parameters<
      typeof normalizeOpenToPreferencesForStorage
    >[0];
    expect(normalizeOpenToPreferencesForStorage(legacy)).toEqual({ selected: ["intros"] });
  });
});

describe("answer-key tags", () => {
  it("accepts the new tags and up to five selections", () => {
    const r = normalizeOpenToPreferencesForStorage({
      selected: ["city_help", "study_advice", "referrals", "coffee", "mentorship"],
    });
    expect(r.selected).toEqual(["city_help", "study_advice", "referrals", "coffee", "mentorship"]);
    expect(OPEN_TO_MAX_SELECTED).toBe(5);
  });
});
