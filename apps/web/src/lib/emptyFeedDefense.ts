import type { HomeOpportunityCategory } from "../components/HomeOpportunityRail";

type Counts = Record<Exclude<HomeOpportunityCategory, "all">, number>;
const LANES = ["careers", "hiring", "relocation", "startups", "guidance"] as const;

/** True when no lane has a single post. Replies are about the viewer, not the feed. */
export function isFeedEmpty(counts: Counts): boolean {
  return LANES.every((lane) => (counts[lane] ?? 0) === 0);
}

/**
 * Lane chips that all say 0 look broken. When the whole feed is empty we drop the
 * lane chips and only keep Replies if the viewer actually has some.
 */
export function visibleCategoryIds(
  all: Array<Exclude<HomeOpportunityCategory, "all">>,
  counts: Counts,
): Array<Exclude<HomeOpportunityCategory, "all">> {
  if (!isFeedEmpty(counts)) return all;
  return all.filter((id) => id === "replies" && (counts.replies ?? 0) > 0);
}
