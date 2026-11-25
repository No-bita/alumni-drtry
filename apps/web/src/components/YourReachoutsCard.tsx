import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { HubSideCard } from "./HubSideCard";
import { brokerKeys, fetchBrokerRequests, progressStages, type BrokerRequest } from "../lib/broker";
import { EXPERIENCE_BAND_LABELS, JOB_FUNCTION_LABELS } from "../lib/jobFunctions";
import { SENT_NOTES_QUERY_KEY, fetchSentNotes, sentNoteStatusLabel } from "../lib/sentNotes";
import { formatRelativeTime } from "../lib/formatRelativeTime";

function requestLabel(r: BrokerRequest): string {
  if (r.kind === "referral") return `Referral at ${r.company}`;
  return `Hiring: ${r.roleTitle || `${JOB_FUNCTION_LABELS[r.jobFunction]} role`}${r.experienceBand ? ` · ${EXPERIENCE_BAND_LABELS[r.experienceBand]}` : ""}`;
}

/** Where a request stands, in the ride-style wording: "2 have seen it" while open, or why it closed. */
function requestStage(r: BrokerRequest): string {
  const stages = progressStages(r);
  const key = r.status === "open" ? "seen" : "result";
  return (stages.find((s) => s.key === key) ?? stages[stages.length - 1]!).label;
}

/**
 * "Your reachouts": what you've asked of others. Requests Alma Mater is asking around for you (open or
 * just closed) and the last three notes you sent. A request that connected shows as the accepted note
 * with that alum, so it isn't listed twice. Hidden when there is nothing.
 */
export function YourReachoutsCard() {
  const sent = useQuery({ queryKey: SENT_NOTES_QUERY_KEY, queryFn: ({ signal }) => fetchSentNotes(signal) });
  const brokered = useQuery({ queryKey: brokerKeys.requests(), queryFn: ({ signal }) => fetchBrokerRequests(signal) });
  const requests = (brokered.data ?? []).filter((r) => r.status !== "connected").slice(0, 3);
  const reachouts = (sent.data?.requests ?? []).slice(0, 3);
  if (requests.length === 0 && reachouts.length === 0) return null;
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
        {requests.map((r) => (
          <li key={r.id}>
            <Link to="/notifications#your-requests" className="hub-card__item">
              <span className="hub-card__item-main">
                <span className="hub-card__item-title">{requestLabel(r)}</span>
                <span className="hub-card__meta">{requestStage(r)}</span>
              </span>
              <span className={`hub-card__status hub-card__status--${r.status === "open" ? "pending" : "declined"}`}>
                {r.status === "open" ? "Asking" : "Closed"}
              </span>
            </Link>
          </li>
        ))}
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
