import { describe, expect, it } from "vitest";
import { mapIntentcastToRow } from "../src/lib/careerFeedRow";
import type { IntentcastFeedItem } from "../src/api/client";

const post = (id: string, category: IntentcastFeedItem["category"], content: string): IntentcastFeedItem =>
  ({
    id, authorPersonId: `a-${id}`, authorFullName: `Author ${id}`, authorDepartmentCode: "cse", authorDepartmentName: "CSE", authorBatchYear: 2019,
    category, content, status: "open", expiresAt: "2099-01-01", closedAt: null, createdAt: new Date().toISOString(), editableUntil: "2099-01-01", responseCount: 0,
  }) as IntentcastFeedItem;

describe("General lane bare URLs", () => {
  it("keeps a bare URL as normal post content instead of a Resume link", () => {
    const row = mapIntentcastToRow(
      post("g1", "guidance", "[[cat:general]]\nProposal for IIT BHU AI Data Centre\nhttps://example.com/proposal-document.pdf"),
      { includeGuidancePosts: true }
    );
    expect(row).toBeTruthy();
    expect(row!.tone).toBe("general");
    expect(row!.resumeListingUrl).toBeNull();
    expect(row!.roleListingUrl).toBeNull();
    expect(row!.summary).toContain("https://example.com/proposal-document.pdf");
  });

  it("still promotes a bare URL to a resume link on can-help posts", () => {
    const row = mapIntentcastToRow(post("c1", "guidance", "Happy to review resumes\nhttps://example.com/cv.pdf"), { includeGuidancePosts: true });
    expect(row).toBeTruthy();
    expect(row!.tone).toBe("can_help");
    expect(row!.resumeListingUrl).toBe("https://example.com/cv.pdf");
  });

  it("still promotes a bare URL to a resume link on mentorship posts", () => {
    const row = mapIntentcastToRow(post("m1", "mentorship", "Referral ask for PM role\nhttps://example.com/cv.pdf"));
    expect(row).toBeTruthy();
    expect(row!.resumeListingUrl).toBe("https://example.com/cv.pdf");
  });
});
