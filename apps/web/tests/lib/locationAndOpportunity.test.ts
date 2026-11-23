import { describe, expect, it } from "vitest";
import { mapIntentcastCategoryToHomeCategory, normalizeOpportunityCard } from "../../src/lib/intentcastOpportunityCard";
import { matchReasonLabel } from "../../src/lib/matchReasonLabels";

describe("opportunity cards", () => {
  it("maps API categories to home lanes", () => {
    expect(mapIntentcastCategoryToHomeCategory("hiring" as never)).toBe("hiring");
    expect(mapIntentcastCategoryToHomeCategory("guidance" as never)).toBe("guidance");
    expect(mapIntentcastCategoryToHomeCategory("mentorship" as never)).toBe("careers");
    expect(mapIntentcastCategoryToHomeCategory("other" as never)).toBe("startups");
  });
  it("splits plain posts into a short title and summary", () => {
    const c = normalizeOpportunityCard("Looking for a flatmate in Pune\nTwo bedroom near Baner, available from May", "other" as never);
    expect(c.title.length).toBeLessThanOrEqual(72);
    expect(c.chips).toEqual([]);
  });
  it("flags relocation posts", () => {
    const c = normalizeOpportunityCard("Moving to Berlin next month, need housing tips", "other" as never);
    expect(c.category).toBe("relocation");
  });
  it("caps title and summary lengths", () => {
    const c = normalizeOpportunityCard(`${"T".repeat(200)}\n${"S".repeat(400)}`, "guidance" as never);
    expect(c.title.length).toBeLessThanOrEqual(72);
    expect(c.summary.length).toBeLessThanOrEqual(160);
    expect(c.category).toBe("guidance");
  });
  it("still labels match reasons", () => {
    expect(matchReasonLabel("same_department")).toBe("Same department");
  });
});
