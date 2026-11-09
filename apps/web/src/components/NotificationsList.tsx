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
      case "announcement":
        // Only offered when the announcement has a link (a path inside the app).
        if (item.linkPath) navigate(item.linkPath);
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
            (item.kind === "connection_thread_reply" ||
            (item.kind === "announcement" && !item.linkPath && activationTarget !== "inbox")
              ? "notifications-page__item"
              : "notifications-page__item notifications-page__item--activatable") +
            (item.unseen ? " notifications-page__item--unseen" : "")
          }
        >
          <NotificationKindTile kind={item.kind} />
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
    case "announcement": {
      const activatable = inSheet || item.linkPath !== null;
      return (
        <>
          {activatable ? (
            <button
              type="button"
              className="notifications-page__item-activate"
              onClick={onActivate}
              aria-label={inSheet ? `Open inbox: announcement ${item.title}` : `Open announcement link: ${item.title}`}
            />
          ) : null}
          <div className="notifications-page__item-main">
            <p className="notifications-page__item-meta">Announcement</p>
            <p className="notifications-page__item-title notifications-page__item-title--announcement">{item.title}</p>
            <p className="notifications-page__item-detail notifications-page__item-detail--announcement">{item.body}</p>
            {item.linkPath && !inSheet ? (
              <p className="notifications-page__item-actions notifications-page__item-actions--link">
                <Link to={item.linkPath} className="notifications-page__item-link">
                  Open
                </Link>
              </p>
            ) : null}
          </div>
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

/** Small tint tile identifying the notification type; color names the kind, nothing else. */
function NotificationKindTile({ kind }: { kind: NotificationItem["kind"] }) {
  switch (kind) {
    case "contact_request_received":
      return (
        <span className="notifications-page__kind-tile notifications-page__kind-tile--request" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
        </span>
      );
    case "bulletin_response":
      return (
        <span className="notifications-page__kind-tile notifications-page__kind-tile--bulletin" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </span>
      );
    case "city_help_offer_received":
      return (
        <span className="notifications-page__kind-tile notifications-page__kind-tile--city" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </span>
      );
    case "contact_request_resolved":
      return (
        <span className="notifications-page__kind-tile notifications-page__kind-tile--resolved" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </span>
      );
    case "announcement":
      return (
        <span className="notifications-page__kind-tile notifications-page__kind-tile--announcement" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </svg>
        </span>
      );
    case "connection_thread_reply":
      return (
        <span className="notifications-page__kind-tile notifications-page__kind-tile--message" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </span>
      );
    default: {
      const _exhaustive: never = kind;
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
