import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { SENT_NOTES_QUERY_KEY, fetchSentNotes, sentNoteStatusLabel } from "../lib/sentNotes";

/** Notifications page: notes you sent from "Reach out", with their status. */
export function SentNotesSection({ enabled }: { enabled: boolean }) {
  const query = useQuery({
    queryKey: SENT_NOTES_QUERY_KEY,
    queryFn: ({ signal }) => fetchSentNotes(signal),
    enabled,
  });
  const notes = query.data?.requests ?? [];

  return (
    <section className="sent-notes" aria-labelledby="sent-notes-title">
      <h2 id="sent-notes-title" className="notifications-page__heading sent-notes__heading">
        Notes you sent
      </h2>
      {query.isPending ? (
        <p className="notifications-page__loading" role="status">
          Loading your notes…
        </p>
      ) : query.isError ? (
        <p className="notifications-page__error" role="alert">
          Couldn’t load your notes. Try again in a moment.
        </p>
      ) : notes.length === 0 ? (
        <p className="notifications-page__empty">You haven’t sent any notes yet.</p>
      ) : (
        <ul className="notifications-page__list">
          {notes.map((n) => {
            const name = n.recipientFullName?.trim() || "An alum";
            return (
              <li key={n.id} className="notifications-page__item">
                <div className="notifications-page__item-main">
                  <p className="notifications-page__item-title">
                    To{" "}
                    <Link to={`/profiles/${n.recipientPersonId}`} className="notifications-page__item-name">
                      {name}
                    </Link>
                    <span className={`sent-notes__status sent-notes__status--${n.status}`}>{sentNoteStatusLabel(n)}</span>
                  </p>
                  <p className="notifications-page__item-meta">
                    Sent {formatRelativeTime(n.createdAt)}
                    {n.respondedAt ? ` · ${n.status === "accepted" ? "accepted" : "declined"} ${formatRelativeTime(n.respondedAt)}` : null}
                  </p>
                  <p className="notifications-page__item-preview">“{n.message}”</p>
                  {n.status === "accepted" && n.recipientContactShared ? (
                    <p className="notifications-page__item-detail">
                      Contact shared:{" "}
                      <a href={`mailto:${n.recipientContactShared}`} className="sent-notes__contact">
                        {n.recipientContactShared}
                      </a>
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
