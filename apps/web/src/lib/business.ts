import type { IntentcastFeedItem } from "../api/client";
import type { LineIconName } from "../components/LineIcon";
import { extractBulletinUiCategory } from "./bulletinPostCardUtils";
import { normalizeOpportunityCard } from "./intentcastOpportunityCard";

/**
 * Business page (/intent/business). Requests are Wall posts in the Startups category, so one post
 * shows on Business and on the Wall. Raise capital is parked until its journey is designed.
 */

/** Ask with a starter sentence typed in, not searched yet (`?draft=`), optionally on a topic (`cat`). */
export function askDraftPath(starter: string, category?: "founder_advice"): string {
  const params = new URLSearchParams({ draft: starter });
  if (category) params.set("cat", category);
  return `/match?${params.toString()}`;
}

export const BUSINESS_SHORTCUTS: ReadonlyArray<{ label: string; to: string; icon: LineIconName }> = [
  { label: "Find customers & partners", to: askDraftPath("I'm looking for customers or partners for "), icon: "people" },
  { label: "Find talent & co-founders", to: askDraftPath("I'm looking for a co-founder or early hire for ", "founder_advice"), icon: "referral" },
  { label: "Get expertise & advice", to: askDraftPath("I need advice on ", "founder_advice"), icon: "advice" },
  { label: "Find suppliers & services", to: askDraftPath("I'm looking for a supplier or service provider for "), icon: "links" },
  // PARKED: "Raise capital" returns when the fundraising journey is designed.
];

/**
 * A Business request = a Wall post in the Startups lane. The category the author picked wins: the
 * Wall's own sorting moves any post that mentions "moving", "city" or "housing" to Relocation, even when
 * it was posted as Startups, and that would drop real business requests here. Posts without a picked
 * category fall back to the Wall's sorting.
 */
export function isBusinessPost(post: Pick<IntentcastFeedItem, "content" | "category">): boolean {
  const picked = extractBulletinUiCategory(post.content);
  if (picked) return picked === "startups";
  return normalizeOpportunityCard(post.content, post.category).category === "startups";
}

export type BusinessTab = "all" | "needs" | "offers";

export const BUSINESS_TABS: ReadonlyArray<{ id: BusinessTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "needs", label: "Needs" },
  { id: "offers", label: "Offers" },
];

export function inBusinessTab(post: Pick<IntentcastFeedItem, "kind">, tab: BusinessTab): boolean {
  if (tab === "needs") return post.kind === "ask";
  if (tab === "offers") return post.kind === "offer";
  return true;
}

/** Progress step shown on your own open request (option A2). Resolved and closed requests leave the list. */
export function requestStep(post: Pick<IntentcastFeedItem, "responseCount">): string {
  const n = post.responseCount ?? 0;
  if (n <= 0) return "Open";
  return n === 1 ? "Has replies · 1" : `Has replies · ${n}`;
}

export const RESOLVED_OUTCOMES = [
  { id: "got_help_here", label: "Got help here" },
  { id: "sorted_elsewhere", label: "Sorted elsewhere" },
  { id: "no_longer_needed", label: "No longer needed" },
] as const;

export type ResolvedOutcome = (typeof RESOLVED_OUTCOMES)[number]["id"];

export const BUSINESS_FEED_PATH = "/v1/intentcasts?limit=48&offset=0&excludeAuthorSoftDeleted=true&category=collaboration";
export const MY_BUSINESS_REQUESTS_PATH =
  "/v1/intentcasts?mine=true&limit=48&offset=0&excludeAuthorSoftDeleted=true&category=collaboration";
