import { describe, expect, it } from "vitest";
import {
  OPEN_TO_CATALOG,
  OPEN_TO_MAX_SELECTED,
  canSelectMoreOpenTo,
  createEmptyOpenToPreferences,
  normalizeOpenToPreferences,
  openToDisplayItems,
  openToPreferencesForEdit,
  parseOpenToPreferences,
  toggleOpenToSelection,
} from "../../src/lib/openToPreferences";

describe("parseOpenToPreferences", () => {
  it("rejects non-objects", () => {
    expect(parseOpenToPreferences(null)).toBeNull();
    expect(parseOpenToPreferences("x")).toBeNull();
    expect(parseOpenToPreferences([])).toBeNull();
  });
  it("parses the modern shape, dropping unknown and duplicate ids and any old per-tag lines", () => {
    const r = parseOpenToPreferences({
      selected: ["coffee", "coffee", "nope", 5, "intros"],
      descriptions: { coffee: "  hi  ", nope: "x" },
    });
    expect(r).toEqual({ selected: ["coffee", "intros"] });
  });
  it("returns null when nothing valid is selected", () => {
    expect(parseOpenToPreferences({ selected: ["nope"] })).toBeNull();
    expect(parseOpenToPreferences({})).toBeNull();
  });
  it("parses the legacy enabled shape", () => {
    const r = parseOpenToPreferences({ coffee: { enabled: true, description: " tea " }, speaking: { enabled: false } });
    expect(r).toEqual({ selected: ["coffee"] });
  });
});

describe("normalizeOpenToPreferences", () => {
  it("caps the selection and keeps only tags and the coffee limit", () => {
    const r = normalizeOpenToPreferences({
      selected: ["referrals", "coffee", "mentorship", "hiring", "advising", "speaking", "intros"],
      limits: { coffee: 3 },
    });
    expect(r).toEqual({ selected: ["referrals", "coffee", "mentorship", "hiring", "advising"], limits: { coffee: 3 } });
    expect(r.selected).toHaveLength(OPEN_TO_MAX_SELECTED);
  });
});

describe("selection helpers", () => {
  it("toggles a tag on and off again", () => {
    const on = toggleOpenToSelection(createEmptyOpenToPreferences(), "coffee");
    expect(on).toEqual({ selected: ["coffee"] });
    expect(toggleOpenToSelection(on, "coffee")).toEqual({ selected: [] });
  });
  it("refuses a sixth selection", () => {
    let p = createEmptyOpenToPreferences();
    for (const id of ["referrals", "coffee", "mentorship", "city_help", "study_advice"] as const) p = toggleOpenToSelection(p, id);
    expect(p.selected).toHaveLength(OPEN_TO_MAX_SELECTED);
    expect(canSelectMoreOpenTo(p)).toBe(false);
    expect(toggleOpenToSelection(p, "hiring")).toBe(p);
  });
  it("copies saved prefs for editing and renders display items", () => {
    expect(openToPreferencesForEdit(null)).toEqual(createEmptyOpenToPreferences());
    const input = { selected: ["coffee" as const] };
    const edit = openToPreferencesForEdit(input);
    expect(edit.selected).not.toBe(input.selected);
    expect(openToDisplayItems(null)).toEqual([]);
    expect(openToDisplayItems(edit)).toEqual([{ id: "coffee", title: "Coffee chats", icon: "coffee" }]);
    expect(Object.values(OPEN_TO_CATALOG).every((entry) => Object.keys(entry).sort().join() === "icon,title")).toBe(true);
  });
});
