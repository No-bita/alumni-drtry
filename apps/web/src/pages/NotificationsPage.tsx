import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useNotificationsList } from "../lib/notificationsQueries";
import { NotificationsList } from "../components/NotificationsList";

/** Full-screen notifications inbox: the destination rows in the quick-view sheet open. */
export function NotificationsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const authenticated = auth.status === "authenticated";
  const listQuery = useNotificationsList(authenticated);
  // Messaging paused: message reply notifications stay hidden, same as the quick-view sheet.
  const items = (listQuery.data?.items ?? []).filter((item) => item.kind !== "connection_thread_reply");

  return (
    <main className="notifications-page">
      <div className="notifications-page__toprow">
        <button
          type="button"
          className="notifications-page__back"
          onClick={() => (location.key === "default" ? navigate("/home", { replace: true }) : navigate(-1))}
          aria-label="Go back"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          Back
        </button>
      </div>
      <h1 className="notifications-page__heading">Notifications</h1>
      {/* Messaging paused: message notifications are hidden while messaging is off. Original: Connection requests, bulletin replies, and new messages */}
      <p className="notifications-page__sub">Connection requests and bulletin replies</p>

      {listQuery.isPending ? (
        <p className="notifications-page__loading" role="status">
          Loading notifications…
        </p>
      ) : listQuery.isError ? (
        <p className="notifications-page__error" role="alert">
          {(listQuery.error as Error).message ?? "Could not load notifications."}
        </p>
      ) : items.length === 0 ? (
        <p className="notifications-page__empty">You&apos;re all caught up — no new activity.</p>
      ) : (
        <NotificationsList items={items} />
      )}
    </main>
  );
}
