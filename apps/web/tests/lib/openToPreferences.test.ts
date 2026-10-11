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
  setOpenToDescription,
  toggleOpenToSelection,
} from "../../src/lib/openToPreferences";

describe("parseOpenToPreferences", () => {
  it("rejects non-objects", () => {
    expect(parseOpenToPreferences(null)).toBeNull();
    expect(parseOpenToPreferences("x")).toBeNull();
    expect(parseOpenToPreferences([])).toBeNull();
  });
  it("parses the modern shape, dropping unknown and duplicate ids", () => {
    const r = parseOpenToPreferences({
      selected: ["coffee", "coffee", "nope", 5, "intros"],
      descriptions: { coffee: "  hi  ", nope: "x" },
    });
    expect(r?.selected).toEqual(["coffee", "intros"]);
    expect(r?.descriptions.coffee).toBe("hi");
    expect(r?.descriptions.intros).toBe(OPEN_TO_CATALOG.intros.defaultDescription);
  });
  it("returns null when nothing valid is selected", () => {
    expect(parseOpenToPreferences({ selected: ["nope"] })).toBeNull();
    expect(parseOpenToPreferences({})).toBeNull();
  });
  it("parses the legacy enabled shape", () => {
    const r = parseOpenToPreferences({ coffee: { enabled: true, description: " tea " }, speaking: { enabled: false } });
    expect(r?.selected).toEqual(["coffee"]);
    expect(r?.descriptions.coffee).toBe("tea");
  });
});

describe("normalizeOpenToPreferences", () => {
  it("caps selection and description length", () => {
    const r = normalizeOpenToPreferences({
      selected: ["referrals", "coffee", "mentorship", "hiring"],
      descriptions: { referrals: "x".repeat(900) },
    });
    expect(r.selected).toHaveLength(OPEN_TO_MAX_SELECTED);
    expect(r.descriptions.referrals).toHaveLength(500);
    expect(r.descriptions.hiring).toBeUndefined();
  });
});

describe("selection helpers", () => {
  it("toggles on with the default description and off again", () => {
    const on = toggleOpenToSelection(createEmptyOpenToPreferences(), "coffee");
    expect(on.selected).toEqual(["coffee"]);
    expect(on.descriptions.coffee).toBe(OPEN_TO_CATALOG.coffee.defaultDescription);
    const off = toggleOpenToSelection(on, "coffee");
    expect(off.selected).toEqual([]);
    expect(off.descriptions.coffee).toBeUndefined();
  });
  it("refuses a fourth selection", () => {
    let p = createEmptyOpenToPreferences();
    for (const id of ["referrals", "coffee", "mentorship"] as const) p = toggleOpenToSelection(p, id);
    expect(canSelectMoreOpenTo(p)).toBe(false);
    expect(toggleOpenToSelection(p, "hiring")).toBe(p);
  });
  it("only edits descriptions of selected options", () => {
    const p = createEmptyOpenToPreferences();
    expect(setOpenToDescription(p, "coffee", "x")).toBe(p);
    const on = toggleOpenToSelection(p, "coffee");
    expect(setOpenToDescription(on, "coffee", "x").descriptions.coffee).toBe("x");
  });
  it("copies saved prefs for editing and renders display items", () => {
    expect(openToPreferencesForEdit(null)).toEqual(createEmptyOpenToPreferences());
    const saved = { selected: ["coffee"] as const, descriptions: { coffee: "tea" } };
    const input = { selected: [...saved.selected], descriptions: saved.descriptions };
    const edit = openToPreferencesForEdit(input);
    expect(edit.selected).not.toBe(input.selected);
    expect(openToDisplayItems(null)).toEqual([]);
    expect(openToDisplayItems(edit)).toEqual([
      { id: "coffee", title: "Coffee chats", description: "tea", icon: "coffee" },
    ]);
  });
});
