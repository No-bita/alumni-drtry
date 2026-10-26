import { describe, expect, it } from "vitest";
import {
  applyIntentOverrides,
  containsPhrase,
  detectedIntentFields,
  parseMatchQuestion,
  type MatchLexicon
} from "../src/lib/matchIntent.js";

const lexicon: MatchLexicon = {
  organizations: ["Razorpay", "Goldman Sachs", "Meesho", "Meta"],
  places: [{ city: "Bengaluru", country: "India", aliases: ["bangalore", "bengaluru"] }]
};

describe("parseMatchQuestion — categories and entities", () => {
  it("referral at a directory company with a role", () => {
    const i = parseMatchQuestion("Need a referral for PM at razorpay", lexicon);
    expect(i.category).toBe("referral");
    expect(i.company).toBe("Razorpay");
    expect(i.role).toBe("Product Manager");
    expect(i.source).toBe("rules");
  });

  it("interview prep picks the longest org name and the role", () => {
    const i = parseMatchQuestion("Interview at Goldman Sachs next week for investment banking analyst, need mock prep", lexicon);
    expect(i.category).toBe("interview_prep");
    expect(i.company).toBe("Goldman Sachs");
    expect(i.role).toBe("Investment Banker");
  });

  it("resolves well-known aliases", () => {
    const i = parseMatchQuestion("referral at aws for sde", lexicon);
    expect(i.company).toBe("Amazon");
    expect(i.role).toBe("Software Engineer");
  });

  it("falls back to a capitalized phrase after a preposition for unknown companies", () => {
    const i = parseMatchQuestion("Can someone refer me at Zeta Labs?", lexicon);
    expect(i.category).toBe("referral");
    expect(i.company).toBe("Zeta Labs");
  });

  it("does not treat 'Meta' inside another word as a company", () => {
    const i = parseMatchQuestion("Interview for metallurgy research role", lexicon);
    expect(i.company).toBeNull();
  });

  it("career switch from engineering to product", () => {
    const i = parseMatchQuestion("How do I switch from engineering to product?", lexicon);
    expect(i.category).toBe("career_switch");
    expect(i.fromRole).toBe("Software Engineer");
    expect(i.role).toBe("Product Manager");
  });

  it("'moving to product' is a career switch, not relocation", () => {
    const i = parseMatchQuestion("thinking of moving to product management", lexicon);
    expect(i.category).toBe("career_switch");
    expect(i.role).toBe("Product Manager");
    expect(i.city).toBeNull();
  });

  it("relocation with a directory place alias", () => {
    const i = parseMatchQuestion("Moving to Bangalore next month, need help finding a flat", lexicon);
    expect(i.category).toBe("relocation");
    expect(i.city).toBe("Bengaluru");
    expect(i.country).toBe("India");
  });

  it("relocation uses fallback places when the directory has none", () => {
    const i = parseMatchQuestion("Relocating to Berlin alone", { organizations: [], places: [] });
    expect(i.category).toBe("relocation");
    expect(i.city).toBe("Berlin");
    expect(i.country).toBe("Germany");
    expect(i.company).toBeNull();
  });

  it("higher studies with programs and country", () => {
    const i = parseMatchQuestion("Deciding between an MS and an MBA in the US", lexicon);
    expect(i.category).toBe("higher_studies");
    expect(i.studyPrograms).toEqual(["ms", "mba"]);
    expect(i.country).toBe("United States");
  });

  it("does not read the pronoun 'us' as a country", () => {
    const i = parseMatchQuestion("can someone help us find a co-founder", lexicon);
    expect(i.country).toBeNull();
    expect(i.category).toBe("founder_advice");
  });

  it("founder advice keeps topic keywords", () => {
    const i = parseMatchQuestion("Looking for a technical co-founder for a climate startup", lexicon);
    expect(i.category).toBe("founder_advice");
    expect(i.keywords).toContain("climate");
    expect(i.keywords).toContain("technical");
  });

  it("returns a null category for vague questions", () => {
    const i = parseMatchQuestion("hello there", lexicon);
    expect(i.category).toBeNull();
    expect(i.company).toBeNull();
    expect(i.role).toBeNull();
  });
});

describe("applyIntentOverrides", () => {
  it("replaces present keys, clears with null/blank, keeps absent keys", () => {
    const base = parseMatchQuestion("referral for PM at Razorpay", lexicon);
    const next = applyIntentOverrides(base, { company: "  ", city: "Pune" });
    expect(next.company).toBeNull();
    expect(next.city).toBe("Pune");
    expect(next.role).toBe("Product Manager");
    expect(next.category).toBe("referral");
  });

  it("drops fromRole when the category is no longer a career switch", () => {
    const base = parseMatchQuestion("switch from engineering to product", lexicon);
    const next = applyIntentOverrides(base, { category: "interview_prep" });
    expect(next.fromRole).toBeNull();
    expect(next.role).toBe("Product Manager");
  });
});

describe("helpers", () => {
  it("detectedIntentFields lists names only", () => {
    const i = parseMatchQuestion("referral for PM at Razorpay in Bangalore", lexicon);
    expect(detectedIntentFields(i)).toEqual(expect.arrayContaining(["company", "role", "city", "country"]));
    expect(detectedIntentFields(i).join(",")).not.toContain("Razorpay");
  });

  it("containsPhrase respects word boundaries and punctuation", () => {
    expect(containsPhrase("refer me at meta.", "meta")).toBe(true);
    expect(containsPhrase("metallurgy", "meta")).toBe(false);
    expect(containsPhrase("m&a role", "m&a")).toBe(true);
  });
});

describe("parseMatchQuestion — review regressions", () => {
  const none: MatchLexicon = { organizations: [], places: [] };

  it("relocation picks the destination, not the city being left", () => {
    expect(parseMatchQuestion("Relocating to London from Bangalore", none).city).toBe("London");
    expect(parseMatchQuestion("Moving from Delhi to Pune", none).city).toBe("Pune");
    expect(parseMatchQuestion("i'm moving to boston from new york", none).city).toBe("Boston");
  });

  it("does not call founder or test-prep questions interview prep", () => {
    expect(parseMatchQuestion("Looking for founders who raised a seed round", none).category).toBe("founder_advice");
    const gre = parseMatchQuestion("Prepare for GRE", none);
    expect(gre.category).toBe("higher_studies");
    expect(gre.company).toBeNull();
  });

  it("keeps interview prep when interview is named alongside other hints", () => {
    expect(parseMatchQuestion("PM interview at a startup", none).category).toBe("interview_prep");
    expect(parseMatchQuestion("MBA interview prep", none).category).toBe("interview_prep");
  });

  it("a company plus a place is not a relocation question", () => {
    const i = parseMatchQuestion("Who works at Google in Seattle?", none);
    expect(i.category).toBeNull();
    expect(i.company).toBe("Google");
    expect(i.city).toBe("Seattle");
  });

  it("reads non-ASCII and symbol company names whole", () => {
    expect(parseMatchQuestion("interview prep at München Robotics", none).company).toBe("München Robotics");
    expect(parseMatchQuestion("Referral at C++ Labs", none).company).toBe("C++ Labs");
  });

  it("recognises plural roles", () => {
    const i = parseMatchQuestion("Mock interviews with consultants", none);
    expect(i.category).toBe("interview_prep");
    expect(i.role).toBe("Consultant");
    const j = parseMatchQuestion("Any data scientists in Berlin?", none);
    expect(j.role).toBe("Data Scientist");
    expect(j.city).toBe("Berlin");
    expect(j.category).toBeNull();
  });
});
