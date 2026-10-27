import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { sentNotesSummary } from "../lib/homeSummary";
import { fetchSentNotes, SENT_NOTES_QUERY_KEY } from "../lib/sentNotes";
import { trackBetaUsageEvent } from "../lib/betaAnalytics";

/** "Your notes · 1 waiting for reply · 1 accepted". Declined notes are not counted; hidden when nothing to show. */
export function HomeSentNotesLine() {
  const query = useQuery({
    queryKey: SENT_NOTES_QUERY_KEY,
    queryFn: ({ signal }) => fetchSentNotes(signal),
  });
  const parts = query.data ? sentNotesSummary(query.data.requests) : null;
  if (!parts) return null;
  return (
    <section className="home-notes-line" aria-label="Your notes">
      <p className="home-notes-line__text">
        <strong>Your notes</strong>
        {parts.map((p) => (
          <span key={p}> · {p}</span>
        ))}
      </p>
      <Link to="/notifications" className="home-notes-line__link" onClick={() => trackBetaUsageEvent("home_notes_clicked")}>
        See your notes →
      </Link>
    </section>
  );
}
