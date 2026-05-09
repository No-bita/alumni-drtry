import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

/** Shown until `/v1/notifications` is wired to real activity. */
const NOTIFICATIONS_PLACEHOLDER_COPY =
  "Notifications aren’t connected yet. When they are, connection requests, bulletin replies, and new messages will show up here.";

export function GlobalNotificationsWidget() {
  const auth = useAuth();
  const location = useLocation();
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const isOpen = openPathname === location.pathname;

  const hiddenOnRoutes = useMemo(() => {
    const p = location.pathname;
    return p === "/" || p.startsWith("/login") || p.startsWith("/auth/verify") || p.startsWith("/onboarding");
  }, [location.pathname]);

  useEffect(() => {
    function onOpen() {
      setOpenPathname(location.pathname);
    }
    window.addEventListener("notifications:open", onOpen as EventListener);
    return () => window.removeEventListener("notifications:open", onOpen as EventListener);
  }, [location.pathname]);

  if (auth.status !== "authenticated" || hiddenOnRoutes || !isOpen) return null;

  return (
    <>
      <button
        type="button"
        className="global-notifications-widget__backdrop"
        aria-label="Close notifications"
        onClick={() => setOpenPathname(null)}
      />
      <section className="global-notifications-widget__panel" role="dialog" aria-modal="true" aria-label="Notifications">
        <header className="global-notifications-widget__head">
          <div>
            <h2>Notifications</h2>
            <span className="global-notifications-widget__stub-caption">Coming soon</span>
          </div>
          <button
            type="button"
            className="global-notifications-widget__close"
            onClick={() => setOpenPathname(null)}
            aria-label="Close notifications"
          >
            ×
          </button>
        </header>
        <p className="global-notifications-widget__placeholder">{NOTIFICATIONS_PLACEHOLDER_COPY}</p>
      </section>
    </>
  );
}
