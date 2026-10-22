import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { trackBetaUsageEvent } from "../lib/betaAnalytics";
import { useNotificationsList } from "../lib/notificationsQueries";
import { NotificationsList } from "./NotificationsList";

export function GlobalNotificationsWidget() {
  const auth = useAuth();
  const location = useLocation();
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const isOpen = openPathname === location.pathname;

  const hiddenOnRoutes = useMemo(() => {
    const p = location.pathname;
    return p === "/" || p.startsWith("/login") || p.startsWith("/auth/verify") || p.startsWith("/onboarding");
  }, [location.pathname]);

  const authenticated = auth.status === "authenticated";
  const listQuery = useNotificationsList(authenticated && isOpen && !hiddenOnRoutes);
  // Messaging paused: message reply notifications are hidden from the panel for now (display-only;
  // the backend list still returns them and no data is touched). Original: const items = listQuery.data?.items ?? [];
  const items = (listQuery.data?.items ?? []).filter((item) => item.kind !== "connection_thread_reply");

  useEffect(() => {
    function onOpen() {
      setOpenPathname(location.pathname);
      trackBetaUsageEvent("notifications_panel_opened");
    }
    window.addEventListener("notifications:open", onOpen as EventListener);
    return () => window.removeEventListener("notifications:open", onOpen as EventListener);
  }, [location.pathname]);

  if (!authenticated || hiddenOnRoutes || !isOpen) return null;

  const close = () => setOpenPathname(null);

  return (
    <>
      <button
        type="button"
        className="global-notifications-widget__backdrop"
        aria-label="Close notifications"
        onClick={close}
      />
      <section className="global-notifications-widget__panel" role="dialog" aria-modal="true" aria-label="Notifications">
        <header className="global-notifications-widget__head">
          <div>
            <h2>Notifications</h2>
            {/* Messaging paused: message notifications are hidden while messaging is off. Original: Connection requests, bulletin replies, and new messages */}
            <p>Connection requests and bulletin replies</p>
          </div>
          <button
            type="button"
            className="global-notifications-widget__close"
            onClick={close}
            aria-label="Close notifications"
          >
            ×
          </button>
        </header>

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
          <NotificationsList items={items} onNavigate={close} />
        )}
      </section>
    </>
  );
}
