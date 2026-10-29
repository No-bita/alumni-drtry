import { useState } from "react";
import { formatRelativeTime } from "../../lib/formatRelativeTime";
import { splitBulletinPostBody, stripBulletinUiCategory } from "../../lib/bulletinPostCardUtils";
import { firstName, yy, type CityPayload, type CityPost } from "../../lib/cities";
import { CityReplySheet } from "./CityNoteSheets";

function postText(content: string): string {
  const { title, summary } = splitBulletinPostBody(stripBulletinUiCategory(content));
  const head = title.trim();
  const rest = (summary ?? "").trim();
  if (!head || !rest) return (head || rest).trim();
  // Headline and details read as two sentences ("…near HSR. Need 6 more.").
  return /[.!?…:]$/.test(head) ? `${head} ${rest}` : `${head}. ${rest}`;
}

/** Screen 1 §6: chapter group (only when configured), city-tagged Wall posts, and "Post a meetup idea". */
export function CityMeetups({
  city,
  posts,
  chapterLink,
  onPost,
  onChanged,
}: {
  city: string;
  posts: CityPost[];
  chapterLink: CityPayload["chapterLink"];
  onPost: () => void;
  onChanged: () => void;
}) {
  const [replyTo, setReplyTo] = useState<CityPost | null>(null);
  return (
    <section className="cities__section" aria-labelledby="cities-together-title">
      <div className="cities__head">
        <h2 id="cities-together-title" className="cities__h2">
          Get together
        </h2>
        <p className="cities__note">Meetups and plans from {city} alumni</p>
      </div>
      {chapterLink ? (
        <a href={chapterLink.url} target="_blank" rel="noopener noreferrer" className="cities__row cities__row--card">
          <span className="cities__switch-copy">
            <span className="cities__switch-title">{chapterLink.label}</span>
            <span className="cities__meta">Opens outside Alma Mater</span>
          </span>
          <span aria-hidden>›</span>
        </a>
      ) : null}
      {posts.length > 0 ? (
        <ul className="cities__cards">
          {posts.map((p) => (
            <li key={p.id} className="cities__card">
              <p className="cities__meta">
                {[p.authorFullName, yy(p.authorBatchYear), formatRelativeTime(p.createdAt)].filter(Boolean).join(" · ")}
              </p>
              <p className="cities__post">{postText(p.content)}</p>
              {p.isMine ? null : p.viewerHasResponded ? (
                <p className="cities__status-row">
                  <span aria-hidden>✓</span> You replied
                </p>
              ) : (
                <button type="button" className="cities__soft" onClick={() => setReplyTo(p)}>
                  Reply to {firstName(p.authorFullName)}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="cities__empty">No plans yet. Start one: a coffee, a game, a walk.</p>
      )}
      <button type="button" className="cities__dashed" onClick={onPost}>
        Post a meetup idea
      </button>
      {replyTo ? <CityReplySheet post={replyTo} onClose={() => setReplyTo(null)} onSent={onChanged} /> : null}
    </section>
  );
}
