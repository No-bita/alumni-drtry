import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { trackBetaUsageEvent } from "../lib/betaAnalytics";
import { useMarkAllNotificationsSeen, useNotificationsList } from "../lib/notificationsQueries";
import { NotificationsList } from "./NotificationsList";

export function GlobalNotificationsWidget() {
  const auth = useAuth();
  const location = useLocation();
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  // Anchor rect of the bell that opened the panel; desktop CSS docks the popover to it (phone keeps the bottom sheet).
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const markAllSeen = useMarkAllNotificationsSeen();
  const isOpen = openPathname === location.pathname;

  const hiddenOnRoutes = useMemo(() => {
    const p = location.pathname;
    return (
      p === "/" ||
      p.startsWith("/login") ||
      p.startsWith("/auth/verify") ||
      p.startsWith("/onboarding") ||
      // The sheet is the quick view of the inbox; on the inbox page itself it has nothing to preview.
      p.startsWith("/notifications")
    );
  }, [location.pathname]);

  const authenticated = auth.status === "authenticated";
  const listQuery = useNotificationsList(authenticated && isOpen && !hiddenOnRoutes);
  // Messaging paused: message reply notifications are hidden from the panel for now (display-only;
  // the backend list still returns them and no data is touched). Original: const items = listQuery.data?.items ?? [];
  const items = (listQuery.data?.items ?? []).filter((item) => item.kind !== "connection_thread_reply");

  useEffect(() => {
    function onOpen(event: Event) {
      const detail = (event as CustomEvent<{ top?: number; right?: number }>).detail;
      setAnchor(detail && typeof detail.top === "number" && typeof detail.right === "number"
        ? { top: detail.top, right: detail.right }
        : null);
      setOpenPathname(location.pathname);
      trackBetaUsageEvent("notifications_panel_opened");
    }
    window.addEventListener("notifications:open", onOpen as EventListener);
    return () => window.removeEventListener("notifications:open", onOpen as EventListener);
  }, [location.pathname]);

  if (!authenticated || hiddenOnRoutes || !isOpen) return null;

  const close = () => setOpenPathname(null);
  const hasUnseen = items.some((item) => item.unseen);

  return (
    <>
      <button
        type="button"
        className="global-notifications-widget__backdrop"
        aria-label="Close notifications"
        onClick={close}
      />
      <section
        className="global-notifications-widget__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        style={
          anchor
            ? ({
                "--notif-anchor-top": `${anchor.top + 8}px`,
                "--notif-anchor-right": `${anchor.right}px`,
              } as CSSProperties)
            : undefined
        }
      >
        <div className="global-notifications-widget__grab" aria-hidden="true" />
        <header className="global-notifications-widget__head">
          <div>
            <h2>Notifications</h2>
            {/* Messaging paused: message notifications are hidden while messaging is off. Original: Connection requests, bulletin replies, and new messages */}
            <p>Connection requests and bulletin replies</p>
          </div>
          <div className="global-notifications-widget__head-actions">
            {hasUnseen ? (
              <button
                type="button"
                className="notifications-mark-seen"
                disabled={markAllSeen.isPending}
                onClick={() => markAllSeen.mutate()}
              >
                {markAllSeen.isPending ? "Marking…" : "Mark all as seen"}
              </button>
            ) : null}
            <button
              type="button"
              className="global-notifications-widget__close"
              onClick={close}
              aria-label="Close notifications"
            >
              ×
            </button>
          </div>
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
          <NotificationsList items={items} onNavigate={close} activationTarget="inbox" />
        )}
      </section>
    </>
  );
}
