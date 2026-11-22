import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useMarkAllNotificationsSeen, useNotificationsList } from "../lib/notificationsQueries";
import { NotificationsList } from "../components/NotificationsList";
import { SentNotesSection } from "../components/SentNotesSection";
import "../styles/sent-notes.css";

/** Full-screen notifications inbox: the destination rows in the quick-view sheet open. */
export function NotificationsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const authenticated = auth.status === "authenticated";
  const listQuery = useNotificationsList(authenticated);
  const markAllSeen = useMarkAllNotificationsSeen();
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
          Back
        </button>
      </div>
      <div className="notifications-page__title-row">
        <h1 className="notifications-page__heading">Notifications</h1>
        {items.some((item) => item.unseen) ? (
          <button
            type="button"
            className="notifications-mark-seen"
            disabled={markAllSeen.isPending}
            onClick={() => markAllSeen.mutate()}
          >
            {markAllSeen.isPending ? "Marking…" : "Mark all as seen"}
          </button>
        ) : null}
      </div>
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

      <SentNotesSection enabled={authenticated} />
    </main>
  );
}
