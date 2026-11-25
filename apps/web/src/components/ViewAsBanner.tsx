import { useEffect, useLayoutEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { endViewAs, reloadAppAt, viewAsName, ViewAsError } from "../lib/viewAs";

/** Longest a browser timer can wait; a view-as session is far shorter anyway. */
const MAX_TIMER_MS = 2_147_000_000;

/**
 * Shown on every page while an admin is viewing as a member: who, read-only, and Exit. Fixed at the top
 * and reserves its own space (like the staging marker), so it never covers controls.
 */
export function ViewAsBanner() {
  const auth = useAuth();
  const viewAs = auth.status === "authenticated" ? (auth.viewAs ?? null) : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = viewAs ? viewAsName(viewAs) : null;

  useLayoutEffect(() => {
    if (!name) return;
    const root = document.documentElement;
    const previousTitle = document.title;
    root.dataset.viewAs = "on";
    document.title = `[Viewing as ${name}] ${previousTitle}`;
    return () => {
      delete root.dataset.viewAs;
      document.title = previousTitle;
    };
  }, [name]);

  // The server ends the session by itself at expiresAt; leave the member's pages then.
  const expiresAt = viewAs?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (!Number.isFinite(ms)) return;
    const timer = window.setTimeout(() => reloadAppAt("/admin/view-as?ended=expired"), Math.min(Math.max(ms + 1000, 0), MAX_TIMER_MS));
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  if (!viewAs || !name) return null;

  const exit = async () => {
    setBusy(true);
    setError(null);
    try {
      await endViewAs();
      reloadAppAt("/admin/view-as?ended=1");
    } catch (err) {
      setError(err instanceof ViewAsError ? err.message : "Couldn't exit view-as. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="view-as-banner" role="region" aria-label="Viewing as a member">
      <p className="view-as-banner__text" role="status">
        Viewing as <strong>{name}</strong> — read-only.
      </p>
      {error ? (
        <p className="view-as-banner__error" role="alert">
          {error}
        </p>
      ) : null}
      <Link to="/admin/analytics#view-as" className="view-as-banner__switch">
        Switch
      </Link>
      <button type="button" className="view-as-banner__exit" disabled={busy} onClick={() => void exit()}>
        {busy ? "Exiting…" : "Exit"}
      </button>
    </div>
  );
}
