import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { Spinner } from "../components/Spinner";
import { api, type NotificationItem, type NotificationsResponse } from "../api/client";
import { assertApiGet } from "../lib/assertApiGet";
import { invalidateNotificationRelatedQueries } from "../lib/invalidateAppQueries";
import { queryKeys } from "../lib/queryKeys";

function formatRelativeTime(iso: string): string {
  const t = Date.now() - new Date(iso).getTime();
  const s = Math.floor(t / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function senderDisplayName(item: Extract<NotificationItem, { kind: "contact_request_received" }>): string {
  return item.senderFullName?.trim() || "An alumni";
}

function recipientDisplayName(item: Extract<NotificationItem, { kind: "contact_request_resolved" }>): string {
  return item.recipientFullName?.trim() || "Alumni";
}

function NotificationBody({
  item,
  busyContactRequestId,
  actionError,
  onContactRespond,
}: {
  item: NotificationItem;
  busyContactRequestId: string | null;
  actionError: { contactRequestId: string; message: string } | null;
  onContactRespond: (contactRequestId: string, action: "accept" | "decline") => void;
}) {
  switch (item.kind) {
    case "contact_request_received": {
      const name = senderDisplayName(item);
      const busy = busyContactRequestId === item.contactRequestId;
      const err =
        actionError?.contactRequestId === item.contactRequestId ? actionError.message : null;
      return (
        <>
          <p className="notifications-page__item-title">
            <Link to={`/profiles/${item.senderPersonId}`} className="notifications-page__item-name">
              {name}
            </Link>{" "}
            sent a connection request
          </p>
          <p className="notifications-page__item-detail">{item.message}</p>
          <div className="notifications-page__item-actions">
            <Button
              type="button"
              variant="primary"
              disabled={busy}
              onClick={() => onContactRespond(item.contactRequestId, "accept")}
            >
              {busy ? "…" : "Accept"}
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => onContactRespond(item.contactRequestId, "decline")}>
              Decline
            </Button>
          </div>
          {err ? (
            <p className="notifications-page__item-action-error" role="alert">
              {err}
            </p>
          ) : null}
        </>
      );
    }
    case "contact_request_resolved": {
      const name = recipientDisplayName(item);
      const verb = item.outcome === "accepted" ? "accepted" : "declined";
      return (
        <>
          <p className="notifications-page__item-title">
            <Link to={`/profiles/${item.recipientPersonId}`} className="notifications-page__item-name">
              {name}
            </Link>{" "}
            {verb} your connection request
          </p>
        </>
      );
    }
    case "bulletin_response": {
      return (
        <>
          <p className="notifications-page__item-title">
            <Link to={`/profiles/${item.responderPersonId}`} className="notifications-page__item-name">
              {item.responderFullName}
            </Link>{" "}
            replied to your bulletin post
          </p>
          <p className="notifications-page__item-preview">&ldquo;{item.postPreview}&rdquo;</p>
          <p className="notifications-page__item-detail">{item.responseMessage}</p>
          <p className="notifications-page__item-meta">
            <Link to={`/home#home-bulletin-${item.intentcastId}`}>View on Home</Link>
          </p>
        </>
      );
    }
    case "connection_thread_reply": {
      const name = item.counterpartyFullName?.trim() || "An alumni";
      return (
        <>
          <p className="notifications-page__item-title">
            <Link to={`/profiles/${item.counterpartyPersonId}`} className="notifications-page__item-name">
              {name}
            </Link>{" "}
            sent a message in your conversation
          </p>
          <p className="notifications-page__item-detail">{item.lastMessagePreview}</p>
          <p className="notifications-page__item-meta">
            <Link to={`/connections/${item.threadId}`}>Open conversation</Link>
          </p>
        </>
      );
    }
    default:
      return null;
  }
}

export function Notifications() {
  const [busyContactRequestId, setBusyContactRequestId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ contactRequestId: string; message: string } | null>(null);

  const listQuery = useQuery({
    queryKey: queryKeys.notifications.list(),
    queryFn: ({ signal }) => assertApiGet<NotificationsResponse>("/v1/notifications", signal),
  });

  const items = listQuery.data?.items ?? null;
  const error =
    listQuery.isError
      ? (listQuery.error as Error).message ?? "Could not load notifications."
      : null;

  const handleContactRespond = useCallback(
    async (contactRequestId: string, action: "accept" | "decline") => {
      setBusyContactRequestId(contactRequestId);
      setActionError(null);
      const { error: err } = await api.patch(`/v1/contact-requests/${contactRequestId}`, { action });
      setBusyContactRequestId(null);
      if (err) {
        setActionError({ contactRequestId, message: err.message ?? err.code ?? "Something went wrong." });
        return;
      }
      setActionError(null);
      invalidateNotificationRelatedQueries();
    },
    []
  );

  return (
    <>
      <Nav variant="home" />
      <div className="home-dashboard" style={{ minHeight: "calc(100dvh - var(--nav-height))" }}>
        <main className="notifications-page">
          <h1 className="notifications-page__heading">Notifications</h1>
          <p className="notifications-page__sub">
            Connection conversations, legacy connection requests (accept/decline), and bulletin replies appear here. You
            may still get emails at your institutional address.
          </p>

          {error ? (
            <p className="notifications-page__error" role="alert">
              {error}
            </p>
          ) : null}

          {listQuery.isPending && !error ? (
            <div className="notifications-page__loading" role="status" aria-live="polite">
              <Spinner />
              <span>Loading…</span>
            </div>
          ) : null}

          {items && items.length === 0 && !error ? (
            <p className="notifications-page__empty">No notifications yet.</p>
          ) : null}

          {items && items.length > 0 ? (
            <ul className="notifications-page__list" role="list">
              {items.map((item) => (
                <li key={item.id} className="notifications-page__item">
                  <div className="notifications-page__item-main">
                    <NotificationBody
                      item={item}
                      busyContactRequestId={busyContactRequestId}
                      actionError={actionError}
                      onContactRespond={handleContactRespond}
                    />
                  </div>
                  <time className="notifications-page__item-time" dateTime={item.occurredAt}>
                    {formatRelativeTime(item.occurredAt)}
                  </time>
                </li>
              ))}
            </ul>
          ) : null}
        </main>
      </div>
    </>
  );
}
