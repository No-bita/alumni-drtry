import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { isShownNotification, useMarkAllNotificationsSeen, useNotificationsList } from "../lib/notificationsQueries";
import { NotificationsList } from "../components/NotificationsList";
import { SentNotesSection } from "../components/SentNotesSection";
import { BrokerAsksSection, BrokerRequestsSection } from "../components/broker/BrokerSections";
import "../styles/sent-notes.css";

/** Full-screen notifications inbox: the destination rows in the quick-view sheet open. */
export function NotificationsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const authenticated = auth.status === "authenticated";
  const listQuery = useNotificationsList(authenticated);
  const markAllSeen = useMarkAllNotificationsSeen();
  // Paused kinds (messages, Cities notes) stay hidden, same as the quick-view sheet.
  const items = (listQuery.data?.items ?? []).filter(isShownNotification);

  // Links like /notifications#requests-for-you land on that section once it has loaded (the router
  // doesn't scroll to a hash, and the sections render after their data arrives).
  useEffect(() => {
    const id = location.hash.slice(1);
    if (!id) return undefined;
    let tries = 0;
    const timer = window.setInterval(() => {
      const el = document.getElementById(id);
      if (el || ++tries >= 30) {
        window.clearInterval(timer);
        el?.scrollIntoView?.({ block: "start" });
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [location.hash, location.key]);

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

      <BrokerAsksSection enabled={authenticated} />
      <div id="your-requests">
        <BrokerRequestsSection enabled={authenticated} />
      </div>
      <SentNotesSection enabled={authenticated} />
    </main>
  );
}
