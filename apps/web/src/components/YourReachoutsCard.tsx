import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { HubSideCard } from "./HubSideCard";
import { SENT_NOTES_QUERY_KEY, fetchSentNotes, sentNoteStatusLabel } from "../lib/sentNotes";
import { formatRelativeTime } from "../lib/formatRelativeTime";

/** "Your reachouts": the last three you sent, with status. Hidden when you haven't sent any. */
export function YourReachoutsCard() {
  const sent = useQuery({ queryKey: SENT_NOTES_QUERY_KEY, queryFn: ({ signal }) => fetchSentNotes(signal) });
  const reachouts = (sent.data?.requests ?? []).slice(0, 3);
  if (reachouts.length === 0) return null;
  return (
    <HubSideCard
      id="hub-your-reachouts-title"
      title="Your reachouts"
      icon="advice"
      action={
        <Link to="/notifications" className="hub-card__more">
          All
        </Link>
      }
    >
      <ul className="hub-card__list">
        {reachouts.map((n) => (
          <li key={n.id}>
            <Link to="/notifications" className="hub-card__item">
              <span className="hub-card__item-main">
                <span className="hub-card__item-title">{n.recipientFullName?.trim() || "An alum"}</span>
                <span className="hub-card__meta">Sent {formatRelativeTime(n.createdAt)}</span>
              </span>
              <span className={`hub-card__status hub-card__status--${n.status}`}>{sentNoteStatusLabel(n)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </HubSideCard>
  );
}
