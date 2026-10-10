import { useMemo, useState } from "react";
import type { IntentcastFeedItem } from "../api/client";
import { buildFootprint } from "../lib/homeFootprint";
import "../styles/home-footprint.css";

type Props = {
  /** The viewer's own open posts (`GET /v1/intentcasts?mine=true`). */
  myPosts: readonly IntentcastFeedItem[];
  /** Total replies on the viewer's posts (`GET /v1/intentcasts/me/received-responses`). */
  replyCount: number;
  viewerPersonId: string;
  /** Switch the Home rail to its Replies tab and bring it into view. */
  onOpenReplies: () => void;
};

const MAX_POSTS_SHOWN = 3;

/** Your own footprint at the top of Home: live posts with expiry, and replies waiting. Renders nothing when empty. */
export function HomeFootprintStrip({ myPosts, replyCount: totalReplies, viewerPersonId, onOpenReplies }: Props) {
  // Expiry labels are read once per mount; the feed refetches on focus and after publish/delete.
  const [now] = useState(() => Date.now());
  const footprint = useMemo(
    () => buildFootprint(myPosts, totalReplies, viewerPersonId, now),
    [myPosts, totalReplies, viewerPersonId, now]
  );
  if (!footprint) return null;
  const { posts, replyCount } = footprint;
  const shown = posts.slice(0, MAX_POSTS_SHOWN);
  const more = posts.length - shown.length;
  return (
    <section className="home-footprint" aria-label="Your activity">
      {replyCount > 0 ? (
        <button type="button" className="home-footprint__replies" onClick={onOpenReplies}>
          <span className="home-footprint__replies-count">{replyCount}</span>{" "}
          <span className="home-footprint__replies-text">
            {replyCount === 1 ? "reply is" : "replies are"} waiting on your posts. Go see who answered.
          </span>
          <span className="home-footprint__chevron" aria-hidden>
            ›
          </span>
        </button>
      ) : null}
      {shown.length > 0 ? (
        <ul className="home-footprint__posts">
          {shown.map((post) => (
            <li key={post.id} className="home-footprint__post">
              <span className="home-footprint__post-title">{post.title}</span>
              <span className="home-footprint__post-meta">
                <span
                  className={`home-footprint__expiry${post.expiryTone === "soon" ? " home-footprint__expiry--soon" : ""}`}
                >
                  {post.expiryLabel}
                </span>
                {post.responseCount > 0 ? (
                  <span className="home-footprint__post-replies">
                    {post.responseCount} {post.responseCount === 1 ? "reply" : "replies"}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {more > 0 ? (
        <span className="home-footprint__more">+{more} more still out there</span>
      ) : null}
    </section>
  );
}
