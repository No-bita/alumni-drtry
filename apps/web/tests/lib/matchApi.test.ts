import { describe, expect, it } from "vitest";
import {
  buildMatchSearch,
  bulletinCategoryForMatch,
  defaultReachOutNote,
  matchHref,
  needsDetailPrompt,
  parseMatchUrlState,
} from "../../src/lib/matchApi";

describe("match URL state", () => {
  it("round-trips the question and chip corrections", () => {
    const search = buildMatchSearch({
      question: "referral for PM at Razorpay",
      overrides: { company: "Cred", city: null, category: "referral" },
    });
    const state = parseMatchUrlState(new URLSearchParams(search));
    expect(state.question).toBe("referral for PM at Razorpay");
    expect(state.overrides).toEqual({ company: "Cred", city: null, category: "referral" });
  });

  it("treats a present-but-empty param as cleared and an absent one as untouched", () => {
    const state = parseMatchUrlState(new URLSearchParams("q=hello&role="));
    expect(state.overrides).toEqual({ role: null });
    expect("company" in state.overrides).toBe(false);
  });

  it("ignores unknown categories", () => {
    expect(parseMatchUrlState(new URLSearchParams("q=x&cat=supplier")).overrides.category).toBeNull();
  });

  it("matchHref starts without corrections", () => {
    expect(matchHref("Moving to Pune")).toBe("/match?q=Moving+to+Pune");
  });
});

describe("match helpers", () => {
  it("maps categories to bulletin categories", () => {
    expect(bulletinCategoryForMatch("referral")).toBe("careers");
    expect(bulletinCategoryForMatch("relocation")).toBe("relocation");
    expect(bulletinCategoryForMatch("founder_advice")).toBe("startups");
    expect(bulletinCategoryForMatch(null)).toBe("guidance");
  });

  it("asks for the missing field by category", () => {
    expect(needsDetailPrompt("relocation")).toEqual({ title: "Which city are you moving to?", field: "city" });
    expect(needsDetailPrompt(null).field).toBeNull();
  });

  it("drafts a reach-out note with the first name and question", () => {
    expect(defaultReachOutNote("Ananya Rao", "Need a referral at Razorpay.")).toBe(
      "Hi Ananya, I found you on Alma Mater. Need a referral at Razorpay.\n\nWould you be open to a quick chat?",
    );
  });
});
