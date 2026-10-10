import { describe, expect, it } from "vitest";
import { isFeedEmpty, visibleCategoryIds } from "../src/lib/emptyFeedDefense";

const ids = ["careers", "relocation", "startups", "guidance", "replies"] as const;
const c = (o: Partial<Record<(typeof ids)[number], number>> = {}) => ({ careers: 0, relocation: 0, startups: 0, guidance: 0, replies: 0, ...o });

describe("empty feed defense", () => {
  it("detects an empty feed", () => {
    expect(isFeedEmpty(c())).toBe(true);
    expect(isFeedEmpty(c({ replies: 4 }))).toBe(true);
    expect(isFeedEmpty(c({ guidance: 1 }))).toBe(false);
  });
  it("drops every chip when the feed and replies are empty", () => {
    expect(visibleCategoryIds([...ids], c())).toEqual([]);
  });
  it("keeps Replies if the viewer has some", () => {
    expect(visibleCategoryIds([...ids], c({ replies: 2 }))).toEqual(["replies"]);
  });
  it("keeps all chips when anything is posted", () => {
    expect(visibleCategoryIds([...ids], c({ careers: 3 }))).toEqual([...ids]);
  });
});
