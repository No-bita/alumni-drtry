import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ContactRequestsInboxResponse } from "../api/client";
import { assertApiGet } from "../lib/assertApiGet";
import { invalidateNotificationRelatedQueries } from "../lib/invalidateAppQueries";
import { queryKeys } from "../lib/queryKeys";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { useState } from "react";

export function ContactRequestsInbox() {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);

  const inboxQuery = useQuery({
    queryKey: queryKeys.contactRequests.inbox(),
    queryFn: ({ signal }) => assertApiGet<ContactRequestsInboxResponse>("/v1/contact-requests/inbox", signal),
  });

  const requests = inboxQuery.data?.requests ?? [];

  const respond = async (id: string, action: "accept" | "decline") => {
    setBusyId(id);
    setRespondError(null);
    const { error: err } = await api.patch(`/v1/contact-requests/${id}`, { action });
    setBusyId(null);
    if (err) {
      setRespondError(err.message ?? err.code);
      return;
    }
    invalidateNotificationRelatedQueries();
    void queryClient.invalidateQueries({ queryKey: queryKeys.contactRequests.inbox() });
  };

  if (inboxQuery.isPending) {
    return (
      <section className="home-dashboard__inbox" aria-label="Connection requests">
        <div className="home-dashboard__inbox-panel">
          <p className="home-dashboard__inbox-caption">Loading connection requests…</p>
        </div>
      </section>
    );
  }

  if (inboxQuery.isError) {
    return (
      <section className="home-dashboard__inbox" aria-label="Connection requests">
        <div className="home-dashboard__inbox-panel">
          <h2 className="home-dashboard__inbox-title">Connection requests</h2>
          <p className="body-text" style={{ color: "var(--brick)", margin: 0, fontSize: 14 }}>
            {(inboxQuery.error as Error).message ?? "Could not load requests."}
          </p>
          <button
            type="button"
            className="home-dashboard__text-link"
            style={{ marginTop: 8 }}
            onClick={() => void inboxQuery.refetch()}
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (requests.length === 0) {
    return null;
  }

  return (
    <section className="home-dashboard__inbox" aria-labelledby="home-inbox-heading">
      <div className="home-dashboard__inbox-panel">
        <header className="home-dashboard__inbox-header">
          <h2 id="home-inbox-heading" className="home-dashboard__inbox-title">
            Connection requests
          </h2>
          <p className="home-dashboard__inbox-caption">Alumni who asked to connect</p>
        </header>
        {respondError ? (
          <p className="body-text" style={{ color: "var(--brick)", margin: "0 0 var(--space-md)", fontSize: 13 }}>
            {respondError}
          </p>
        ) : null}
        <ul className="home-dashboard__inbox-list">
          {requests.map((r) => {
            const name = r.senderFullName?.trim() || "Alumni";
            const busy = busyId === r.id;
            return (
              <li key={r.id} className="home-dashboard__inbox-item">
                <div className="home-dashboard__inbox-item-head">
                  <Link to={`/profiles/${r.senderPersonId}`} className="home-dashboard__inbox-sender">
                    <Avatar name={name} size="sm" tone="pastel" />
                    <span className="home-dashboard__inbox-sender-name">{name}</span>
                  </Link>
                </div>
                <p className="home-dashboard__inbox-message">{r.message}</p>
                <div className="home-dashboard__inbox-actions">
                  <Button
                    type="button"
                    variant="primary"
                    disabled={busy}
                    onClick={() => void respond(r.id, "accept")}
                  >
                    {busy ? "…" : "Accept"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void respond(r.id, "decline")}
                  >
                    Decline
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
