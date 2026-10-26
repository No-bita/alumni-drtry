import { describe, expect, it } from "vitest";
import { parseMatchQuestion, type MatchIntent } from "../src/lib/matchIntent.js";
import {
  buildMatchReasons,
  intentNeedsDetail,
  qualifies,
  rankMatches,
  type MatchCandidateSignals
} from "../src/lib/matchScore.js";

function candidate(overrides: Partial<MatchCandidateSignals> & { personId: string }): MatchCandidateSignals {
  return {
    fullName: `Alum ${overrides.personId}`,
    batchYear: 2018,
    departmentCode: "cse",
    departmentName: "Computer Science and Engineering",
    headlineRoleTitle: null,
    headlineOrganizationName: null,
    residenceCity: null,
    residenceCountry: null,
    currentAtCompany: null,
    pastAtCompany: null,
    currentRoleMatch: null,
    pastRoleMatch: null,
    pastFromRoleMatch: null,
    cityMatch: false,
    countryMatch: false,
    studyProgramMatch: null,
    studyTypeMatch: null,
    founderMatch: null,
    keywordHits: [],
    openTo: [],
    completenessScore: 0,
    ...overrides
  };
}

const lexicon = { organizations: ["Razorpay"], places: [] };
const referral: MatchIntent = parseMatchQuestion("referral for PM at Razorpay", lexicon);

describe("qualifies", () => {
  it("referral with a company requires a current occupation there", () => {
    const past = candidate({
      personId: "a",
      pastAtCompany: { roleTitle: "PM", organizationName: "Razorpay", isCurrent: false }
    });
    const current = candidate({
      personId: "b",
      currentAtCompany: { roleTitle: "PM", organizationName: "Razorpay", isCurrent: true }
    });
    expect(qualifies(referral, past)).toBe(false);
    expect(qualifies(referral, current)).toBe(true);
  });

  it("open-to tags alone never qualify", () => {
    const c = candidate({ personId: "c", openTo: ["referrals", "hiring"] });
    expect(qualifies(referral, c)).toBe(false);
  });

  it("keyword hits alone never qualify, even for a vague question", () => {
    const vague = parseMatchQuestion("hello fintech", lexicon);
    const c = candidate({ personId: "d", keywordHits: ["fintech"] });
    expect(qualifies(vague, c)).toBe(false);
    expect(intentNeedsDetail(vague)).toBe(true);
  });

  it("relocation without a place needs detail", () => {
    const i = parseMatchQuestion("Moving to a new city alone", lexicon);
    expect(i.category).toBe("relocation");
    expect(intentNeedsDetail(i)).toBe(true);
  });
});

describe("rankMatches", () => {
  it("ranks current-at-company + open-to above current-at-company alone, and caps results", () => {
    const at = { roleTitle: "Senior Product Manager", organizationName: "Razorpay", isCurrent: true };
    const rows = [
      candidate({ personId: "p1", currentAtCompany: at, completenessScore: 900 }),
      candidate({ personId: "p2", currentAtCompany: at, openTo: ["referrals"], completenessScore: 100 }),
      candidate({ personId: "p3", openTo: ["referrals"] }),
      ...Array.from({ length: 8 }, (_, n) => candidate({ personId: `z${n}`, currentAtCompany: at }))
    ];
    const ranked = rankMatches(referral, rows);
    expect(ranked).toHaveLength(5);
    expect(ranked[0]!.candidate.personId).toBe("p2");
    expect(ranked.map((r) => r.candidate.personId)).not.toContain("p3");
    expect(ranked[0]!.whyThem).toBe("Currently Senior Product Manager at Razorpay · Open to referrals");
    expect(ranked[0]!.relevantOpenTo).toEqual(["referrals"]);
  });

  it("is deterministic on ties (completeness, then id)", () => {
    const at = { roleTitle: "PM", organizationName: "Razorpay", isCurrent: true };
    const ranked = rankMatches(referral, [
      candidate({ personId: "b", currentAtCompany: at, completenessScore: 10 }),
      candidate({ personId: "a", currentAtCompany: at, completenessScore: 10 }),
      candidate({ personId: "c", currentAtCompany: at, completenessScore: 50 })
    ]);
    expect(ranked.map((r) => r.candidate.personId)).toEqual(["c", "a", "b"]);
  });
});

describe("buildMatchReasons", () => {
  it("career switch reports the move only when both sides are real", () => {
    const i = parseMatchQuestion("switch from engineering to product", lexicon);
    const moved = candidate({
      personId: "m",
      currentRoleMatch: { roleTitle: "Product Manager", organizationName: "Swiggy", isCurrent: true },
      pastFromRoleMatch: { roleTitle: "Software Engineer", organizationName: "Oracle", isCurrent: false }
    });
    const onlyPm = candidate({
      personId: "n",
      currentRoleMatch: { roleTitle: "Product Manager", organizationName: "Swiggy", isCurrent: true }
    });
    expect(buildMatchReasons(i, moved)[0]!.text).toBe("Moved from Software Engineer to Product Manager at Swiggy");
    expect(buildMatchReasons(i, onlyPm)[0]!.text).toBe("Currently Product Manager at Swiggy");
  });

  it("relocation reason uses the alum's own residence values", () => {
    const i = parseMatchQuestion("Relocating to Berlin", { organizations: [], places: [] });
    const c = candidate({ personId: "r", cityMatch: true, residenceCity: "Berlin", residenceCountry: "Germany", openTo: ["coffee"] });
    expect(rankMatches(i, [c])[0]!.whyThem).toBe("Lives in Berlin, Germany · Open to coffee chats");
  });

  it("does not repeat the same occupation twice", () => {
    const i = parseMatchQuestion("PM interview at Razorpay", lexicon);
    const occ = { roleTitle: "Product Manager", organizationName: "Razorpay", isCurrent: true };
    const c = candidate({ personId: "x", currentAtCompany: occ, currentRoleMatch: occ });
    const texts = buildMatchReasons(i, c).map((r) => r.text);
    expect(texts).toEqual(["Currently Product Manager at Razorpay"]);
  });
});

describe("ranking tiers", () => {
  it("a past employee of the asked company outranks a same-role alum elsewhere who is open to help", () => {
    const i = parseMatchQuestion("PM interview at Razorpay", lexicon);
    const pastAtCompany = candidate({
      personId: "ritika",
      pastAtCompany: { roleTitle: "Product Manager", organizationName: "Razorpay", isCurrent: false },
      pastRoleMatch: { roleTitle: "Product Manager", organizationName: "Razorpay", isCurrent: false }
    });
    const elsewhere = candidate({
      personId: "karan",
      currentRoleMatch: { roleTitle: "Product Manager", organizationName: "Swiggy", isCurrent: true },
      openTo: ["mentorship"],
      keywordHits: ["payments", "fintech"]
    });
    expect(rankMatches(i, [elsewhere, pastAtCompany]).map((r) => r.candidate.personId)).toEqual(["ritika", "karan"]);
  });
});

describe("vague questions qualify on the most specific entity", () => {
  it("company + city with no category requires the company", () => {
    const i = parseMatchQuestion("Who works at Google in Seattle?", { organizations: [], places: [] });
    const resident = candidate({ personId: "s", cityMatch: true, residenceCity: "Seattle" });
    const googler = candidate({
      personId: "g",
      currentAtCompany: { roleTitle: "SWE", organizationName: "Google", isCurrent: true },
      cityMatch: true,
      residenceCity: "Seattle",
      residenceCountry: "United States"
    });
    expect(qualifies(i, resident)).toBe(false);
    expect(qualifies(i, googler)).toBe(true);
  });
});

describe("answer-key tags", () => {
  it("relocation prefers city_help and lists it first", () => {
    const i = parseMatchQuestion("Relocating to Berlin", { organizations: [], places: [] });
    const c = candidate({ personId: "h", cityMatch: true, residenceCity: "Berlin", residenceCountry: "Germany", openTo: ["coffee", "city_help"] });
    const [m] = rankMatches(i, [c]);
    expect(m!.relevantOpenTo).toEqual(["city_help", "coffee"]);
    expect(m!.whyThem).toBe("Lives in Berlin, Germany · Open to helping newcomers settle in & coffee chats");
  });

  it("higher studies counts study_advice as will-help", () => {
    const i = parseMatchQuestion("Planning an MS in Germany", { organizations: [], places: [] });
    const c = candidate({
      personId: "s",
      studyTypeMatch: { roleTitle: "MSc Informatics", organizationName: "TU Munich", isCurrent: false },
      openTo: ["study_advice"]
    });
    expect(rankMatches(i, [c])[0]!.relevantOpenTo).toEqual(["study_advice"]);
  });
});
