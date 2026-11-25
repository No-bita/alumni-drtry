import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  brokerKeys,
  brokerRequestTitle,
  conversationLinkLabel,
  conversationPath,
  fetchBrokerRequests,
  type BrokerConversationSummary,
} from "../../lib/broker";
import { useBrokerAsks } from "../../hooks/useBrokerAsks";
import { EXPERIENCE_BAND_LABELS, JOB_FUNCTION_LABELS } from "../../lib/jobFunctions";
import { formatBatchYearShort } from "../../lib/bulletinPostCardUtils";
import { Button } from "../Button";
import { NoteBody } from "../NoteBody";
import { BrokerProgress } from "./BrokerProgress";
import "../../styles/broker.css";

function firstNameOf(name: string): string {
  return name.split(/\s+/)[0] || name;
}

/** The way into a connected request's conversation, with how many messages you haven't read. */
export function ConversationLink({ requestId, summary, name }: { requestId: string; summary: BrokerConversationSummary; name: string }) {
  const label = conversationLinkLabel(summary, firstNameOf(name));
  return (
    <Link
      to={conversationPath(requestId)}
      className={`btn ${summary.unreadCount > 0 ? "btn--primary" : "btn--secondary"} broker-card__convo`}
      aria-label={summary.unreadCount > 0 ? `${label} from ${name}` : `${label}: conversation with ${name}`}
    >
      {label}
      {summary.unreadCount > 0 ? <span className="broker-card__unread" aria-hidden="true" /> : null}
    </Link>
  );
}

/** "Your requests": the asker's progress for each brokered request. Hidden when there are none. */
export function BrokerRequestsSection({ enabled }: { enabled: boolean }) {
  const q = useQuery({ queryKey: brokerKeys.requests(), queryFn: ({ signal }) => fetchBrokerRequests(signal), enabled });
  const requests = q.data ?? [];
  if (!enabled || requests.length === 0) return null;
  return (
    <section className="broker-section" aria-labelledby="broker-requests-title">
      <h2 id="broker-requests-title" className="broker-section__title">
        Your requests
      </h2>
      <p className="broker-section__sub">We ask alumni for you. You only hear when someone says yes.</p>
      {requests.map((r) => (
        <article key={r.id} className="broker-card" aria-label={brokerRequestTitle(r)}>
          <div className="broker-card__head">
            <p className="broker-card__title">{brokerRequestTitle(r)}</p>
          </div>
          <BrokerProgress request={r} />
          {r.status === "connected" && r.connection ? (
            <>
              <p className="broker-card__contact">
                <Link to={`/profiles/${r.connection.personId}`}>{r.connection.fullName?.trim() || "An alum"}</Link>
                {" "}· Message them here. Contact details stay private unless one of you shares them.
              </p>
              {r.conversation ? (
                <div className="broker-card__actions">
                  <ConversationLink requestId={r.id} summary={r.conversation} name={r.connection.fullName?.trim() || "them"} />
                </div>
              ) : null}
            </>
          ) : null}
        </article>
      ))}
    </section>
  );
}

/** The ask cards themselves (no section chrome). */
export function BrokerAskCards({ state }: { state: ReturnType<typeof useBrokerAsks> }) {
  const { visible, busy, errors, answer } = state;
  return (
    <>
      {visible.map((a) => {
        const name = a.asker.fullName?.trim() || "An alum";
        const who = [a.asker.institutionName, a.asker.batchYear ? formatBatchYearShort(a.asker.batchYear) : null].filter(Boolean).join(" · ");
        const title =
          a.kind === "referral"
            ? `${name} is looking for a referral at ${a.company}`
            : `${name} is hiring: ${[a.roleTitle || `${JOB_FUNCTION_LABELS[a.jobFunction]} role`, a.company, a.experienceBand ? EXPERIENCE_BAND_LABELS[a.experienceBand] : null].filter(Boolean).join(" · ")}`;
        return (
          <article key={a.askId} className="broker-card" aria-label={title}>
            <div className="broker-card__head">
              <p className="broker-card__title">
                <Link to={`/profiles/${a.asker.personId}`}>{name}</Link>
                {title.slice(name.length)}
              </p>
              {who ? <p className="broker-card__meta">{who}</p> : null}
            </div>
            {a.details ? <NoteBody details={a.details} hideTag /> : <p className="broker-card__body">{a.message}</p>}
            {a.kind === "hiring" && a.jobUrl ? (
              <p className="broker-card__meta">
                <a href={a.jobUrl} target="_blank" rel="noopener noreferrer">
                  Job description
                </a>
              </p>
            ) : null}
            {a.status === "accepted" ? (
              <>
                <p className="broker-card__contact" role="status">
                  You said yes. We&apos;ve told {name}. Talk it through here; your contact details stay private unless you share them.
                </p>
                {a.conversation ? (
                  <div className="broker-card__actions">
                    <ConversationLink requestId={a.requestId} summary={a.conversation} name={name} />
                  </div>
                ) : null}
              </>
            ) : (
              <div className="broker-card__actions">
                <Button type="button" variant="primary" disabled={busy === a.askId} onClick={() => void answer(a, "accept")}>
                  {busy === a.askId ? "…" : "Accept"}
                </Button>
                <Button type="button" variant="secondary" disabled={busy === a.askId} onClick={() => void answer(a, "decline")}>
                  Decline
                </Button>
              </div>
            )}
            {errors[a.askId] ? (
              <p className="broker-card__error" role="alert">
                {errors[a.askId]}
              </p>
            ) : null}
          </article>
        );
      })}
    </>
  );
}

/** "Requests for you" on Notifications: Alma Mater asked you on someone's behalf. Yes connects you; no one is told about a no. */
export function BrokerAsksSection({ enabled }: { enabled: boolean }) {
  const state = useBrokerAsks(enabled);
  if (!enabled || state.visible.length === 0) return null;
  return (
    <section className="broker-section" id="requests-for-you" aria-labelledby="broker-asks-title">
      <h2 id="broker-asks-title" className="broker-section__title">
        Requests for you
      </h2>
      <p className="broker-section__sub">Alma Mater asked you on a member&apos;s behalf. Decline and no one is told.</p>
      <BrokerAskCards state={state} />
    </section>
  );
}
