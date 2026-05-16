import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, type NotificationItem } from "../api/client";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { invalidateNotificationRelatedQueries } from "../lib/invalidateAppQueries";
import { trackBetaUsageEvent } from "../lib/betaAnalytics";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "./Button";

type NotificationsListProps = {
  items: NotificationItem[];
  onNavigate?: () => void;
};

function displayName(name: string | null | undefined): string {
  return name?.trim() || "Alumni";
}

export function NotificationsList({ items, onNavigate }: NotificationsListProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busyContactRequestId, setBusyContactRequestId] = useState<string | null>(null);
  const [contactRequestError, setContactRequestError] = useState<string | null>(null);

  const respondToContactRequest = async (id: string, action: "accept" | "decline") => {
    setBusyContactRequestId(id);
    setContactRequestError(null);
    const { error } = await api.patch(`/v1/contact-requests/${id}`, { action });
    setBusyContactRequestId(null);
    if (error) {
      setContactRequestError(error.message ?? error.code);
      return;
    }
    invalidateNotificationRelatedQueries();
    void queryClient.invalidateQueries({ queryKey: queryKeys.contactRequests.inbox() });
  };

  const handleItemActivate = (item: NotificationItem) => {
    trackBetaUsageEvent("notification_item_clicked", { kind: item.kind, id: item.id });
    onNavigate?.();

    switch (item.kind) {
      case "connection_thread_reply":
        navigate(`/connections/${item.threadId}`);
        break;
      case "contact_request_received":
        navigate(`/profiles/${item.senderPersonId}`);
        break;
      case "contact_request_resolved":
        navigate(`/profiles/${item.recipientPersonId}`);
        break;
      case "bulletin_response":
        navigate("/home");
        break;
      default: {
        const _exhaustive: never = item;
        return _exhaustive;
      }
    }
  };

  return (
    <ul className="notifications-page__list">
      {contactRequestError ? (
        <li className="notifications-page__item">
          <p className="notifications-page__item-action-error">{contactRequestError}</p>
        </li>
      ) : null}
      {items.map((item) => (
        <li key={item.id} className="notifications-page__item">
          <NotificationListItem
            item={item}
            busyContactRequestId={busyContactRequestId}
            onActivate={() => handleItemActivate(item)}
            onRespondToContactRequest={respondToContactRequest}
          />
        </li>
      ))}
    </ul>
  );
}

type NotificationListItemProps = {
  item: NotificationItem;
  busyContactRequestId: string | null;
  onActivate: () => void;
  onRespondToContactRequest: (id: string, action: "accept" | "decline") => void;
};

function NotificationListItem({
  item,
  busyContactRequestId,
  onActivate,
  onRespondToContactRequest,
}: NotificationListItemProps) {
  const timeLabel = formatRelativeTime(item.occurredAt);

  switch (item.kind) {
    case "connection_thread_reply": {
      const name = displayName(item.counterpartyFullName);
      return (
        <>
          <ClickableNotificationBody
            title={
              <>
                <Link
                  to={`/profiles/${item.counterpartyPersonId}`}
                  className="notifications-page__item-name"
                  onClick={(e) => e.stopPropagation()}
                >
                  {name}
                </Link>{" "}
                sent you a message
              </>
            }
            preview={item.lastMessagePreview}
            onActivate={onActivate}
          />
          <time className="notifications-page__item-time" dateTime={item.occurredAt}>
            {timeLabel}
          </time>
        </>
      );
    }
    case "contact_request_received": {
      const name = displayName(item.senderFullName);
      const busy = busyContactRequestId === item.contactRequestId;
      return (
        <>
          <div className="notifications-page__item-main">
            <p className="notifications-page__item-title">
              <Link
                to={`/profiles/${item.senderPersonId}`}
                className="notifications-page__item-name"
              >
                {name}
              </Link>{" "}
              wants to connect
            </p>
            <p className="notifications-page__item-detail">{item.message}</p>
            <div className="notifications-page__item-actions">
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={() => void onRespondToContactRequest(item.contactRequestId, "accept")}
              >
                {busy ? "…" : "Accept"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void onRespondToContactRequest(item.contactRequestId, "decline")}
              >
                Decline
              </Button>
            </div>
          </div>
          <time className="notifications-page__item-time" dateTime={item.occurredAt}>
            {timeLabel}
          </time>
        </>
      );
    }
    case "contact_request_resolved": {
      const name = displayName(item.recipientFullName);
      const outcomeLabel = item.outcome === "accepted" ? "accepted" : "declined";
      return (
        <>
          <ClickableNotificationBody
            title={
              <>
                <Link
                  to={`/profiles/${item.recipientPersonId}`}
                  className="notifications-page__item-name"
                  onClick={(e) => e.stopPropagation()}
                >
                  {name}
                </Link>{" "}
                {outcomeLabel} your connection request
              </>
            }
            onActivate={onActivate}
          />
          <time className="notifications-page__item-time" dateTime={item.occurredAt}>
            {timeLabel}
          </time>
        </>
      );
    }
    case "bulletin_response": {
      const name = displayName(item.responderFullName);
      return (
        <>
          <ClickableNotificationBody
            title={
              <>
                <Link
                  to={`/profiles/${item.responderPersonId}`}
                  className="notifications-page__item-name"
                  onClick={(e) => e.stopPropagation()}
                >
                  {name}
                </Link>{" "}
                replied to your bulletin post
              </>
            }
            meta={<span className="notifications-page__item-preview">“{item.postPreview}”</span>}
            preview={item.responseMessage}
            onActivate={onActivate}
          />
          <time className="notifications-page__item-time" dateTime={item.occurredAt}>
            {timeLabel}
          </time>
        </>
      );
    }
    default: {
      const _exhaustive: never = item;
      return _exhaustive;
    }
  }
}

function ClickableNotificationBody({
  title,
  meta,
  preview,
  onActivate,
}: {
  title: ReactNode;
  meta?: ReactNode;
  preview?: string;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      className="notifications-page__item-main notifications-page__item-main--link"
      onClick={onActivate}
    >
      <p className="notifications-page__item-title">{title}</p>
      {meta ? <p className="notifications-page__item-meta">{meta}</p> : null}
      {preview ? <p className="notifications-page__item-detail">{preview}</p> : null}
    </button>
  );
}
