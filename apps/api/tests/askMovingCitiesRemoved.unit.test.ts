import { describe, expect, it } from "vitest";
import { MATCH_CATEGORIES, parseMatchQuestion } from "../src/lib/matchIntent.js";
import { CATEGORY_OPEN_TO } from "../src/lib/matchScore.js";
import { ADVICE_TOPICS, NoteDetailsError, validateNoteDetails } from "../src/lib/noteDetails.js";

/** Ask's "Moving cities" kind of help left with Cities (2026-11-25). */
describe("Moving cities removed from Ask", () => {
  it("is no longer a kind of help, an Open-to mapping or a note topic", () => {
    expect(MATCH_CATEGORIES).not.toContain("relocation");
    expect(Object.keys(CATEGORY_OPEN_TO)).not.toContain("relocation");
    expect(ADVICE_TOPICS).not.toContain("relocation");
  });

  it("a question naming only a place has no kind of help but keeps the place to search on", () => {
    const i = parseMatchQuestion("Anyone in Pune? Moving there soon", { organizations: [], places: [] });
    expect(i.category).toBeNull();
    expect(i.city).toBe("Pune");
  });

  it("new advice notes can't pick the old topic", () => {
    expect(() => validateNoteDetails({ purpose: "advice", topic: "relocation", question: "x".repeat(90) })).toThrow(NoteDetailsError);
  });
});
