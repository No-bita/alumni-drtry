import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { RouteNoticeContent, RouteNoticeState } from "../lib/routeNotices";
import "./RouteNotice.css";

const AUTO_DISMISS_MS = 9000;

/**
 * Shows a short notice when a redirect carried `state.notice`, then clears that state so a refresh
 * or back-navigation does not show it again.
 */
export function RouteNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<RouteNoticeContent | null>(() => (location.state as RouteNoticeState | null)?.notice ?? null);

  const [noticeLocation, setNoticeLocation] = useState(location);
  const next = (location.state as RouteNoticeState | null)?.notice;
  if (noticeLocation !== location) {
    setNoticeLocation(location);
    if (next?.message) setNotice(next);
  }

  useEffect(() => {
    if (!next?.message) return;
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  }, [location, navigate, next]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [notice]);

  if (!notice) return null;

  return (
    <div className="route-notice" role="status" aria-live="polite">
      <p className="route-notice__text">{notice.message}</p>
      <button
        type="button"
        className="route-notice__close"
        aria-label="Dismiss"
        onClick={() => setNotice(null)}
      >
        ×
      </button>
    </div>
  );
}
