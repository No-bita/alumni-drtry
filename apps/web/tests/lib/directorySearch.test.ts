import { describe, expect, it } from "vitest";
import { DIRECTORY_KEYWORD_MAX_LENGTH } from "../../src/constants/directorySearch";
import {
  EMPTY_DIRECTORY_SEARCH_DRAFT,
  buildSearchParamsFromDraft,
  clearDirectorySearchFacet,
  countDirectoryFilterParams,
  draftMatchesUrl,
  draftsEqual,
  normalizeQ,
  parseDirectorySearchFromParams,
} from "../../src/lib/directorySearchUrlState";
import { MATCH_REASON_LABELS, matchReasonLabel } from "../../src/lib/matchReasonLabels";

describe("directory search url state", () => {
  it("parses an empty query string into the empty draft", () => {
    expect(parseDirectorySearchFromParams(new URLSearchParams(""))).toEqual(EMPTY_DIRECTORY_SEARCH_DRAFT);
  });

  it("parses every facet and ignores a non-numeric batch", () => {
    const d = parseDirectorySearchFromParams(
      new URLSearchParams("q=ml&batch=2019&dept=cse&company=Acme&occ=eng&residenceCountry=IN&residenceCity=Pune"),
    );
    expect(d).toEqual({
      q: "ml",
      batch: 2019,
      dept: "cse",
      company: "Acme",
      occ: "eng",
      residenceCountry: "IN",
      residenceCity: "Pune",
    });
    expect(parseDirectorySearchFromParams(new URLSearchParams("batch=abc")).batch).toBeNull();
  });

  it("round-trips through search params", () => {
    const d = { ...EMPTY_DIRECTORY_SEARCH_DRAFT, q: " ai ", batch: 2020, dept: "cse", residenceCity: "Pune" };
    const sp = buildSearchParamsFromDraft(d);
    expect(sp.get("q")).toBe("ai");
    expect(sp.get("batch")).toBe("2020");
    expect(draftMatchesUrl(d, sp)).toBe(true);
  });

  it("omits blank facets and an all-space keyword", () => {
    const sp = buildSearchParamsFromDraft({ ...EMPTY_DIRECTORY_SEARCH_DRAFT, q: "   " });
    expect(sp.toString()).toBe("");
  });

  it("caps the keyword length", () => {
    const long = "a".repeat(DIRECTORY_KEYWORD_MAX_LENGTH + 50);
    expect(normalizeQ(long)).toHaveLength(DIRECTORY_KEYWORD_MAX_LENGTH);
    expect(buildSearchParamsFromDraft({ ...EMPTY_DIRECTORY_SEARCH_DRAFT, q: long }).get("q")).toHaveLength(
      DIRECTORY_KEYWORD_MAX_LENGTH,
    );
  });

  it("treats null and empty facets as equal, and trims the keyword when comparing", () => {
    expect(draftsEqual({ ...EMPTY_DIRECTORY_SEARCH_DRAFT, q: " x " }, { ...EMPTY_DIRECTORY_SEARCH_DRAFT, q: "x" })).toBe(true);
    expect(draftsEqual({ ...EMPTY_DIRECTORY_SEARCH_DRAFT, dept: "" }, EMPTY_DIRECTORY_SEARCH_DRAFT)).toBe(true);
    expect(draftsEqual({ ...EMPTY_DIRECTORY_SEARCH_DRAFT, batch: 1 }, EMPTY_DIRECTORY_SEARCH_DRAFT)).toBe(false);
  });

  it("counts structured filters but not the keyword", () => {
    expect(countDirectoryFilterParams({ ...EMPTY_DIRECTORY_SEARCH_DRAFT, q: "x" })).toBe(0);
    expect(
      countDirectoryFilterParams({
        q: "x",
        batch: 1,
        dept: "cse",
        company: "a",
        occ: "b",
        residenceCountry: "IN",
        residenceCity: "Pune",
      }),
    ).toBe(6);
  });

  it("clears exactly one facet", () => {
    const full = { q: "x", batch: 1, dept: "cse", company: "a", occ: "b", residenceCountry: "IN", residenceCity: "Pune" };
    for (const key of Object.keys(full) as (keyof typeof full)[]) {
      const cleared = clearDirectorySearchFacet(full, key);
      expect(cleared[key]).toBe(key === "q" ? "" : null);
      const others = Object.keys(full).filter((k) => k !== key) as (keyof typeof full)[];
      for (const o of others) expect(cleared[o]).toBe(full[o]);
    }
  });
});

describe("matchReasonLabel", () => {
  it("maps known keys", () => {
    for (const [k, v] of Object.entries(MATCH_REASON_LABELS)) expect(matchReasonLabel(k)).toBe(v);
  });
  it("humanises unknown keys", () => {
    expect(matchReasonLabel("some_new_reason")).toBe("some new reason");
  });
});
