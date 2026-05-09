import { describe, expect, it } from "vitest";
import { buildMatchReasonKeys, queryMatchesProfileName } from "./discoveryMatchReasons.js";
import type { SearchProfileRow } from "../repos/discoveryRepo.js";

describe("queryMatchesProfileName", () => {
  it("matches case-insensitive substring on first name", () => {
    expect(queryMatchesProfileName("Kavya Reddy", "kavya")).toBe(true);
  });

  it("matches when query tokens appear in name in any order", () => {
    expect(queryMatchesProfileName("Kavya Reddy", "reddy kavya")).toBe(true);
  });

  it("does not match when query tokens are not in the name", () => {
    expect(queryMatchesProfileName("Kavya Reddy", "material sciences")).toBe(false);
  });
});

describe("buildMatchReasonKeys", () => {
  const baseRow = {
    id: "00000000-0000-4000-8000-000000000001",
    full_name: "Kavya Reddy",
    department_code: null,
    department_name: null,
    parsed_department_code: null,
    parsed_department_name: null,
    batch_year: null,
    parsed_joining_year: null,
    degree_code: null,
    degree_name: null,
    bio: null,
    headline_role_title: null,
    headline_organization_name: null,
    residence_country: null,
    residence_city: null,
    sort_name: "kavya reddy",
    rank_tier: 2,
    completeness_score: 0,
    profile_completed_at: null,
    soft_company_match: 0,
    soft_occ_match: 0
  } satisfies SearchProfileRow;

  it("uses name_match for tier-2 keyword hits when query matches display name", () => {
    const keys = buildMatchReasonKeys(baseRow, {
      batchWidened: false,
      hasKeywordQ: true,
      queryText: "kavya"
    });
    expect(keys).toContain("name_match");
    expect(keys).not.toContain("keyword_match");
  });

  it("uses keyword_match when tier-2 and query does not match name", () => {
    const keys = buildMatchReasonKeys(
      { ...baseRow, full_name: "Someone Else" },
      {
        batchWidened: false,
        hasKeywordQ: true,
        queryText: "kavya"
      }
    );
    expect(keys).toContain("keyword_match");
    expect(keys).not.toContain("name_match");
  });
});
