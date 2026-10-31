import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, type NotificationItem } from "../api/client";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { invalidateNotificationRelatedQueries } from "../lib/invalidateAppQueries";
import { trackBetaUsageEvent } from "../lib/betaAnalytics";
import { queryKeys } from "../lib/queryKeys";
import { HELP_KIND_LABELS, cityNoteKindLabel } from "../lib/cities";
import { Button } from "./Button";
import { NoteBody } from "./NoteBody";

type NotificationsListProps = {
  items: NotificationItem[];
  onNavigate?: () => void;
  /** "inbox": every row tap opens the full-screen inbox instead of the per-kind destination. */
  activationTarget?: "inbox";
};

function displayName(name: string | null | undefined): string {
  return name?.trim() || "Alumni";
}

export function NotificationsList({ items, onNavigate, activationTarget }: NotificationsListProps) {
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

    if (activationTarget === "inbox") {
      navigate("/notifications");
      return;
    }

    switch (item.kind) {
      case "connection_thread_reply":
        // Messaging paused: the thread page is commented out, so message notifications do not deep-link for now.
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
      case "city_help_offer_received":
        navigate("/intent/location");
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
        <li
          key={item.id}
          className={
            item.kind === "connection_thread_reply"
              ? "notifications-page__item"
              : "notifications-page__item notifications-page__item--activatable"
          }
        >
          <NotificationListItem
            item={item}
            busyContactRequestId={busyContactRequestId}
            inSheet={activationTarget === "inbox"}
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
  /** Quick view (bottom sheet): every tap except decision controls opens the inbox, so names render as plain text. */
  inSheet: boolean;
  onActivate: () => void;
  onRespondToContactRequest: (id: string, action: "accept" | "decline") => void;
};

function NotificationListItem({
  item,
  busyContactRequestId,
  inSheet,
  onActivate,
  onRespondToContactRequest,
}: NotificationListItemProps) {
  const timeLabel = formatRelativeTime(item.occurredAt);

  switch (item.kind) {
    case "connection_thread_reply": {
      const name = displayName(item.counterpartyFullName);
      // Messaging paused: the thread page is commented out, so a message notification renders as
      // non-interactive content instead of a dead button that only closes the panel. Original:
      // <ClickableNotificationBody
      //   title={<>...{name} sent you a message</>}
      //   preview={item.lastMessagePreview}
      //   onActivate={onActivate}
      // />
      return (
        <>
          <div className="notifications-page__item-main">
            <p className="notifications-page__item-title">
              <Link
                to={`/profiles/${item.counterpartyPersonId}`}
                className="notifications-page__item-name"
              >
                {name}
              </Link>{" "}
              sent you a message
            </p>
            {item.lastMessagePreview ? (
              <p className="notifications-page__item-detail">{item.lastMessagePreview}</p>
            ) : null}
          </div>
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
          <button
            type="button"
            className="notifications-page__item-activate"
            onClick={onActivate}
            aria-label={
              inSheet
                ? `Open inbox for connection request from ${name}`
                : `Open profile of ${name}`
            }
          />
          <div className="notifications-page__item-main">
            <p className="notifications-page__item-title">
              <ProfileName personId={item.senderPersonId} name={name} inSheet={inSheet} />{" "}
              {(item.source === "cities" ? cityNoteKindLabel(item.sourceCategory) : null) ?? "wants to connect"}
            </p>
            {item.details ? <NoteBody details={item.details} /> : <p className="notifications-page__item-detail">{item.message}</p>}
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
          <button
            type="button"
            className="notifications-page__item-activate"
            onClick={onActivate}
            aria-label={
              inSheet
                ? `Open inbox: ${name} ${outcomeLabel} your connection request`
                : `Open profile of ${name}`
            }
          />
          <ClickableNotificationBody
            title={
              <>
                <ProfileName personId={item.recipientPersonId} name={name} inSheet={inSheet} />{" "}
                {outcomeLabel} your connection request
              </>
            }
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
          <button
            type="button"
            className="notifications-page__item-activate"
            onClick={onActivate}
            aria-label={
              inSheet
                ? `Open inbox for bulletin reply from ${name}`
                : `Open Home for bulletin response from ${name}`
            }
          />
          <ClickableNotificationBody
            title={
              <>
                <ProfileName personId={item.responderPersonId} name={name} inSheet={inSheet} />{" "}
                replied to your bulletin post
              </>
            }
            meta={<span className="notifications-page__item-preview">“{item.postPreview}”</span>}
            preview={item.responseMessage}
          />
          <time className="notifications-page__item-time" dateTime={item.occurredAt}>
            {timeLabel}
          </time>
        </>
      );
    }
    case "city_help_offer_received": {
      const name = displayName(item.offererFullName);
      return (
        <>
          <button
            type="button"
            className="notifications-page__item-activate"
            onClick={onActivate}
            aria-label={inSheet ? `Open inbox: ${name} offered to help` : `Open Cities: ${name} offered to help`}
          />
          <ClickableNotificationBody
            title={
              <>
                <ProfileName personId={item.offererPersonId} name={name} inSheet={inSheet} /> offered to help you settle in{" "}
                {item.cityName}
              </>
            }
            preview={item.kinds.map((k) => HELP_KIND_LABELS[k]).join(" · ")}
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

function ProfileName({ personId, name, inSheet }: { personId: string; name: string; inSheet: boolean }) {
  if (inSheet) {
    return <span className="notifications-page__item-name">{name}</span>;
  }
  return (
    <Link to={`/profiles/${personId}`} className="notifications-page__item-name">
      {name}
    </Link>
  );
}

function ClickableNotificationBody({
  title,
  meta,
  preview,
}: {
  title: ReactNode;
  meta?: ReactNode;
  preview?: string;
}) {
  return (
    <div className="notifications-page__item-main">
      <p className="notifications-page__item-title">{title}</p>
      {meta ? <p className="notifications-page__item-meta">{meta}</p> : null}
      {preview ? <p className="notifications-page__item-detail">{preview}</p> : null}
    </div>
  );
}
