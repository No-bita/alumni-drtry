import type { IntentcastFeedItem } from "../api/client";

type FeedQueryOptions = {
  category: IntentcastFeedItem["category"] | null;
  mine: boolean;
  authorHistory: boolean;
  excludeAuthorSoftDeleted: boolean;
};

export function buildIntentcastFeedQuery(offset: number, options: FeedQueryOptions): URLSearchParams {
  const q = new URLSearchParams({
    limit: "15",
    offset: String(offset),
  });
  if (options.category) q.set("category", options.category);
  if (options.mine) q.set("mine", "true");
  if (options.authorHistory) q.set("authorHistory", "true");
  if (options.excludeAuthorSoftDeleted) q.set("excludeAuthorSoftDeleted", "true");
  return q;
}

type BuildVisibleIntentcastsOptions = {
  showFeed: boolean;
  feedFlat: IntentcastFeedItem[];
  highlightIntentcast: IntentcastFeedItem | null | undefined;
  viewerPersonId: string | undefined;
  feedMine: boolean;
  feedAuthorHistory: boolean;
  feedExcludeAuthorSoftDeleted: boolean;
  applyCareerHiringFilter: boolean;
  shouldHideCareerHiringPost: (intentcast: IntentcastFeedItem) => boolean;
};

export function buildVisibleIntentcasts(options: BuildVisibleIntentcastsOptions): IntentcastFeedItem[] {
  if (!options.showFeed) return [];

  let list = [...options.feedFlat];
  const hi = options.highlightIntentcast;
  if (
    hi &&
    !list.some((ic) => ic.id === hi.id) &&
    !(options.feedMine && options.feedAuthorHistory && options.viewerPersonId && hi.authorPersonId !== options.viewerPersonId) &&
    !(options.feedExcludeAuthorSoftDeleted && hi.authorSoftDeletedAt)
  ) {
    list = [hi, ...list];
  }

  if (options.applyCareerHiringFilter) {
    list = list.filter((ic) => !options.shouldHideCareerHiringPost(ic));
  }

  return list;
}
