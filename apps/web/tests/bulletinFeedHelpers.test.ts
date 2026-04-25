import { describe, expect, it, vi } from "vitest";
import { buildIntentcastFeedQuery, buildVisibleIntentcasts } from "../src/components/bulletinFeedHelpers";
import { makeIntentcast } from "./fixtures/intentcast";

describe("buildIntentcastFeedQuery", () => {
  it("includes all enabled filters and default pagination", () => {
    const q = buildIntentcastFeedQuery(30, {
      category: "hiring",
      mine: true,
      authorHistory: true,
      excludeAuthorSoftDeleted: true,
    });

    expect(q.get("limit")).toBe("15");
    expect(q.get("offset")).toBe("30");
    expect(q.get("category")).toBe("hiring");
    expect(q.get("mine")).toBe("true");
    expect(q.get("authorHistory")).toBe("true");
    expect(q.get("excludeAuthorSoftDeleted")).toBe("true");
  });
});

describe("buildVisibleIntentcasts", () => {
  it("prepends highlight when not already in list and allowed", () => {
    const feed = [makeIntentcast({ id: "a" }), makeIntentcast({ id: "b" })];
    const hi = makeIntentcast({ id: "hi" });

    const visible = buildVisibleIntentcasts({
      showFeed: true,
      feedFlat: feed,
      highlightIntentcast: hi,
      viewerPersonId: "person-1",
      feedMine: false,
      feedAuthorHistory: false,
      feedExcludeAuthorSoftDeleted: false,
      applyCareerHiringFilter: false,
      shouldHideCareerHiringPost: () => false,
    });

    expect(visible.map((x) => x.id)).toEqual(["hi", "a", "b"]);
  });

  it("does not prepend highlight when mine+history excludes another author", () => {
    const feed = [makeIntentcast({ id: "a", authorPersonId: "viewer-1" })];
    const hi = makeIntentcast({ id: "hi", authorPersonId: "other-1" });

    const visible = buildVisibleIntentcasts({
      showFeed: true,
      feedFlat: feed,
      highlightIntentcast: hi,
      viewerPersonId: "viewer-1",
      feedMine: true,
      feedAuthorHistory: true,
      feedExcludeAuthorSoftDeleted: false,
      applyCareerHiringFilter: false,
      shouldHideCareerHiringPost: () => false,
    });

    expect(visible.map((x) => x.id)).toEqual(["a"]);
  });

  it("applies career filter predicate when enabled", () => {
    const feed = [makeIntentcast({ id: "a" }), makeIntentcast({ id: "b" })];
    const shouldHideCareerHiringPost = vi.fn((item: { id: string }) => item.id === "b");

    const visible = buildVisibleIntentcasts({
      showFeed: true,
      feedFlat: feed,
      highlightIntentcast: null,
      viewerPersonId: undefined,
      feedMine: false,
      feedAuthorHistory: false,
      feedExcludeAuthorSoftDeleted: false,
      applyCareerHiringFilter: true,
      shouldHideCareerHiringPost,
    });

    expect(shouldHideCareerHiringPost).toHaveBeenCalledTimes(2);
    expect(visible.map((x) => x.id)).toEqual(["a"]);
  });
});
