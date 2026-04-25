import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { IntentcastFeedItem, IntentcastFeedResponse } from "../api/client";

export function patchIntentcastInFeedCache(params: {
  queryClient: QueryClient;
  feedQueryKey: readonly unknown[];
  intentcastId: string;
  map: (intentcast: IntentcastFeedItem) => IntentcastFeedItem;
}) {
  const { queryClient, feedQueryKey, intentcastId, map } = params;
  queryClient.setQueryData<InfiniteData<IntentcastFeedResponse>>(feedQueryKey, (old) => {
    if (!old) return old;
    return {
      pageParams: old.pageParams,
      pages: old.pages.map((page) => ({
        ...page,
        intentcasts: page.intentcasts.map((ic) => (ic.id === intentcastId ? map(ic) : ic)),
      })),
    };
  });
}

export function prependIntentcastToFeedCache(params: {
  queryClient: QueryClient;
  feedQueryKey: readonly unknown[];
  posted: IntentcastFeedItem;
}) {
  const { queryClient, feedQueryKey, posted } = params;
  queryClient.setQueryData<InfiniteData<IntentcastFeedResponse>>(feedQueryKey, (old) => {
    if (!old?.pages[0]) return old;
    const [first, ...rest] = old.pages;
    return {
      ...old,
      pages: [
        {
          ...first,
          intentcasts: [posted, ...first.intentcasts.filter((x) => x.id !== posted.id)],
        },
        ...rest,
      ],
    };
  });
}
