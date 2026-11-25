import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { brokerKeys, fetchBrokerAsks, fetchBrokerRequests, type BrokerAsk, type BrokerRequest } from "../../lib/broker";
import { EXPERIENCE_BAND_LABELS, JOB_FUNCTION_LABELS } from "../../lib/jobFunctions";
import { formatBatchYearShort } from "../../lib/bulletinPostCardUtils";
import { queryKeys } from "../../lib/queryKeys";
import { Button } from "../Button";
import { NoteBody } from "../NoteBody";
import { BrokerProgress } from "./BrokerProgress";
import "../../styles/broker.css";

function requestTitle(r: Pick<BrokerRequest, "kind" | "company" | "roleTitle" | "jobFunction" | "experienceBand">): string {
  if (r.kind === "referral") return ["Referral", r.company, r.roleTitle].filter(Boolean).join(" · ");
  return ["Hiring", r.roleTitle || `${JOB_FUNCTION_LABELS[r.jobFunction]} role`, r.experienceBand ? EXPERIENCE_BAND_LABELS[r.experienceBand] : null]
    .filter(Boolean)
    .join(" · ");
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
        <article key={r.id} className="broker-card" aria-label={requestTitle(r)}>
          <div className="broker-card__head">
            <p className="broker-card__title">{requestTitle(r)}</p>
          </div>
          <BrokerProgress request={r} />
          {r.status === "connected" && r.connection ? (
            <p className="broker-card__contact">
              <Link to={`/profiles/${r.connection.personId}`}>{r.connection.fullName?.trim() || "Your contact"}</Link>
              {r.connection.contactShared ? <> · {r.connection.contactShared}</> : null}
            </p>
          ) : null}
        </article>
      ))}
    </section>
  );
}

/** "Requests for you": Alma Mater asked you on someone's behalf. Yes connects you; no one is told about a no. */
export function BrokerAsksSection({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: brokerKeys.asks(), queryFn: ({ signal }) => fetchBrokerAsks(signal), enabled });
  const asks = useMemo(() => q.data ?? [], [q.data]);
  const seenSent = useRef(new Set<string>());
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // Opening the page counts as seeing each new ask (the asker's "seen" step).
  useEffect(() => {
    for (const a of asks) {
      if (a.status !== "asked" || a.seenAt || seenSent.current.has(a.askId)) continue;
      seenSent.current.add(a.askId);
      void api.post(`/v1/broker-asks/${a.askId}/seen`);
    }
  }, [asks]);

  const answer = async (a: BrokerAsk, action: "accept" | "decline") => {
    setBusy(a.askId);
    setErrors((e) => ({ ...e, [a.askId]: "" }));
    const { error } = await api.post(`/v1/broker-asks/${a.askId}/respond`, { action });
    setBusy(null);
    if (error) {
      setErrors((e) => ({ ...e, [a.askId]: error.message ?? "Couldn't save your answer. Try again." }));
      if (error.code === "BROKER_ALREADY_HELPED" || error.code === "BROKER_REQUEST_CLOSED") void q.refetch();
      return;
    }
    if (action === "decline") setHidden((h) => new Set(h).add(a.askId));
    void queryClient.invalidateQueries({ queryKey: brokerKeys.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
  };

  const visible = asks.filter((a) => !hidden.has(a.askId));
  if (!enabled || visible.length === 0) return null;
  return (
    <section className="broker-section" id="requests-for-you" aria-labelledby="broker-asks-title">
      <h2 id="broker-asks-title" className="broker-section__title">
        Requests for you
      </h2>
      <p className="broker-section__sub">Alma Mater asked you on a member&apos;s behalf. Not this time? No one is told.</p>
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
              <p className="broker-card__contact" role="status">
                You said yes. {name} has your contact{a.askerContact ? <>, and you can reach them at {a.askerContact}</> : null}.
              </p>
            ) : (
              <div className="broker-card__actions">
                <Button type="button" variant="primary" disabled={busy === a.askId} onClick={() => void answer(a, "accept")}>
                  {busy === a.askId ? "…" : a.kind === "referral" ? "Yes, I'll refer" : "Yes, I'm interested"}
                </Button>
                <Button type="button" variant="secondary" disabled={busy === a.askId} onClick={() => void answer(a, "decline")}>
                  Not this time
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
    </section>
  );
}
