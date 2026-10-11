import type { IntentcastFeedItem } from "../api/client";
import { normalizeOpportunityCard } from "./intentcastOpportunityCard";

export type FootprintPost = {
  id: string;
  title: string;
  expiryLabel: string;
  /** "soon" when under 48 hours remain, otherwise "ok". */
  expiryTone: "ok" | "soon";
  responseCount: number;
};

export type Footprint = {
  posts: FootprintPost[];
  /** Total replies on the viewer's posts (from the received-responses feed). */
  replyCount: number;
};

const HOUR_MS = 3_600_000;

/** "Expires in 5 days", "Expires in 6 hours", "Last call: under an hour left". Null when already past. */
export function expiryState(expiresAtIso: string, now: number): { label: string; tone: "ok" | "soon" } | null {
  const left = new Date(expiresAtIso).getTime() - now;
  if (!Number.isFinite(left) || left <= 0) return null;
  const hours = Math.floor(left / HOUR_MS);
  if (hours < 1) return { label: "Last call: under an hour left", tone: "soon" };
  if (hours < 48) return { label: `Last call: ${hours} hour${hours === 1 ? "" : "s"} left`, tone: "soon" };
  const days = Math.floor(hours / 24);
  return { label: `Live for ${days} more days`, tone: "ok" };
}

/**
 * The viewer's own live posts (open, not removed, not expired) plus their reply count.
 * Posts are newest first. Returns null when there is nothing to show.
 */
export function buildFootprint(
  myPosts: readonly IntentcastFeedItem[],
  replyCount: number,
  viewerPersonId: string,
  now: number
): Footprint | null {
  const posts: FootprintPost[] = [];
  const newestFirst = [...myPosts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  for (const ic of newestFirst) {
    if (ic.authorPersonId !== viewerPersonId) continue;
    if (ic.status !== "open" || ic.closedAt || ic.authorSoftDeletedAt) continue;
    const expiry = expiryState(ic.expiresAt, now);
    if (!expiry) continue;
    const title = normalizeOpportunityCard(ic.content, ic.category).title.trim() || "Your post";
    posts.push({ id: ic.id, title, expiryLabel: expiry.label, expiryTone: expiry.tone, responseCount: ic.responseCount });
  }
  const replies = Math.max(0, replyCount);
  if (posts.length === 0 && replies === 0) return null;
  return { posts, replyCount: replies };
}
