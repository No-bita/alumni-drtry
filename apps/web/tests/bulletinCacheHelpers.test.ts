import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { IntentcastFeedResponse } from "../src/api/client";
import { patchIntentcastInFeedCache, prependIntentcastToFeedCache } from "../src/components/bulletinCacheHelpers";
import { makeIntentcast } from "./fixtures/intentcast";

type FakeQueryClient = Pick<QueryClient, "setQueryData">;

function runCacheUpdate(
  updater: (queryClient: FakeQueryClient, key: readonly unknown[]) => void,
  initial: InfiniteData<IntentcastFeedResponse>
) {
  let current = initial;
  const queryClient: FakeQueryClient = {
    setQueryData: (_key, callback) => {
      const next = callback(current);
      if (next) current = next;
      return next;
    },
  };
  const key = ["intentcasts", "feed"] as const;
  updater(queryClient, key);
  return current;
}

describe("patchIntentcastInFeedCache", () => {
  it("updates matching feed item across pages", () => {
    const before: InfiniteData<IntentcastFeedResponse> = {
      pageParams: [0, 1],
      pages: [
        { intentcasts: [makeIntentcast({ id: "a", content: "before" })], pageInfo: { hasMore: true, nextOffset: 1 } },
        {
          intentcasts: [makeIntentcast({ id: "b", content: "unchanged" })],
          pageInfo: { hasMore: false, nextOffset: null },
        },
      ],
    };

    const after = runCacheUpdate((queryClient, key) => {
      patchIntentcastInFeedCache({
        queryClient: queryClient as QueryClient,
        feedQueryKey: key,
        intentcastId: "a",
        map: (ic) => ({ ...ic, content: "after" }),
      });
    }, before);

    expect(after.pages[0]?.intentcasts[0]?.content).toBe("after");
    expect(after.pages[1]?.intentcasts[0]?.content).toBe("unchanged");
  });
});

describe("prependIntentcastToFeedCache", () => {
  it("prepends to first page and de-duplicates by id", () => {
    const before: InfiniteData<IntentcastFeedResponse> = {
      pageParams: [0],
      pages: [
        {
          intentcasts: [makeIntentcast({ id: "x" }), makeIntentcast({ id: "y" })],
          pageInfo: { hasMore: false, nextOffset: null },
        },
      ],
    };

    const posted = makeIntentcast({ id: "y", content: "newest" });
    const after = runCacheUpdate((queryClient, key) => {
      prependIntentcastToFeedCache({
        queryClient: queryClient as QueryClient,
        feedQueryKey: key,
        posted,
      });
    }, before);

    expect(after.pages[0]?.intentcasts.map((x) => x.id)).toEqual(["y", "x"]);
    expect(after.pages[0]?.intentcasts[0]?.content).toBe("newest");
  });
});
