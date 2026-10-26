import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { MATCH_CATEGORY_LABELS, isMatchCategory } from "../lib/matchApi";

type FunnelRow = {
  category: string | null;
  questions: number;
  needsDetail: number;
  withMatches: number;
  notesSent: number;
  notesAccepted: number;
  notesDeclined: number;
  notesPending: number;
  medianReplyDays: number | null;
};

export type AskMatchMetrics = {
  windowDays: number;
  total: FunnelRow;
  byCategory: FunnelRow[];
  remindersSent: number;
  profiles: {
    members: number;
    withCurrentRole: number;
    withPastRole: number;
    withOpenTo: number;
    withBio: number;
    withCity: number;
  };
};

function pct(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

function categoryLabel(c: string | null): string {
  return isMatchCategory(c) ? MATCH_CATEGORY_LABELS[c] : "No clear category";
}

/** Admin card: Ask → Match funnel (last 30 days) + profile completeness. */
export function AskMatchMetricsSection() {
  const query = useQuery({
    queryKey: ["admin-metrics", "ask-match"],
    queryFn: async () => {
      const { data, error } = await api.get<{ metrics: AskMatchMetrics }>("/v1/admin/metrics/ask-match");
      if (error || !data) throw new Error(error?.message ?? "Could not load Ask → Match metrics.");
      return data.metrics;
    },
  });

  if (query.isPending) {
    return <p className="body-text profile-page__muted-text">Loading Ask → Match metrics…</p>;
  }
  if (query.isError || !query.data) {
    return <p className="body-text profile-page__error-text">Could not load Ask → Match metrics right now.</p>;
  }

  const m = query.data;
  const t = m.total;
  const p = m.profiles;

  return (
    <>
      <section className="profile-page__analytics-section" aria-label="Ask → Match funnel">
        <h3 className="profile-page__analytics-title">Ask → Match funnel (last {m.windowDays} days)</h3>
        <p className="body-text profile-page__muted-text">
          Questions from demo accounts aren’t logged. “Needed more detail” is tracked from this release on. Notes count
          only those sent from a match card.
        </p>
        <ul className="profile-page__analytics-list">
          <li><span>Questions asked</span><strong>{t.questions}</strong></li>
          <li><span>Needed more detail</span><strong>{t.needsDetail} ({pct(t.needsDetail, t.questions)})</strong></li>
          <li><span>Got at least one match</span><strong>{t.withMatches} ({pct(t.withMatches, t.questions)})</strong></li>
          <li><span>Notes sent from matches</span><strong>{t.notesSent}</strong></li>
          <li><span>Accepted</span><strong>{t.notesAccepted} ({pct(t.notesAccepted, t.notesSent)})</strong></li>
          <li><span>Declined</span><strong>{t.notesDeclined}</strong></li>
          <li><span>Still waiting</span><strong>{t.notesPending}</strong></li>
          <li><span>Median days to reply</span><strong>{t.medianReplyDays ?? "—"}</strong></li>
          <li><span>Reminder emails sent</span><strong>{m.remindersSent}</strong></li>
        </ul>
      </section>

      <section className="profile-page__analytics-section" aria-label="Ask → Match by category">
        <h3 className="profile-page__analytics-title">By category (questions → matched → notes → accepted)</h3>
        {m.byCategory.length === 0 ? (
          <p className="body-text profile-page__muted-text">No questions in this window yet.</p>
        ) : (
          <ul className="profile-page__analytics-list">
            {m.byCategory.map((c) => (
              <li key={c.category ?? "none"}>
                <span>{categoryLabel(c.category)}</span>
                <strong>
                  {c.questions} → {c.withMatches} → {c.notesSent} → {c.notesAccepted}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="profile-page__analytics-section" aria-label="Profile completeness">
        <h3 className="profile-page__analytics-title">Profile completeness (members, now)</h3>
        <ul className="profile-page__analytics-list">
          <li><span>Members (completed profiles)</span><strong>{p.members}</strong></li>
          <li><span>With a current role</span><strong>{p.withCurrentRole} ({pct(p.withCurrentRole, p.members)})</strong></li>
          <li><span>With a past role</span><strong>{p.withPastRole} ({pct(p.withPastRole, p.members)})</strong></li>
          <li><span>With an answer key (Open-to)</span><strong>{p.withOpenTo} ({pct(p.withOpenTo, p.members)})</strong></li>
          <li><span>With a bio</span><strong>{p.withBio} ({pct(p.withBio, p.members)})</strong></li>
          <li><span>With a city</span><strong>{p.withCity} ({pct(p.withCity, p.members)})</strong></li>
        </ul>
      </section>
    </>
  );
}
