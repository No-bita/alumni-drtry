import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { unsubscribeWithToken } from "../lib/adminAnnouncements";
import "../styles/admin-companies.css";
import "../styles/admin-announcements.css";

type State = "working" | "unsubscribed" | "resubscribed" | "invalid" | "error";

/**
 * /unsubscribe?token= — opened from the link in an announcement email. Public: the signed token is the
 * proof. Opening the page unsubscribes (the email link itself never does, since mail scanners open links).
 */
export function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get("token")?.trim() ?? "";
  const [state, setState] = useState<State>(token ? "working" : "invalid");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const run = async (undo: boolean) => {
    setBusy(true);
    try {
      const unsubscribed = await unsubscribeWithToken(token, undo);
      setState(unsubscribed ? "unsubscribed" : "resubscribed");
    } catch (err) {
      const code = (err as { code?: string }).code;
      setState(code === "ANNOUNCEMENT_UNSUBSCRIBE_INVALID" ? "invalid" : "error");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    void run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <main className="an-unsub">
      <div className="an-unsub__card" aria-live="polite">
        {state === "working" ? (
          <>
            <h1 className="an-unsub__title">Unsubscribing…</h1>
            <p className="an-unsub__text">One moment.</p>
          </>
        ) : state === "unsubscribed" ? (
          <>
            <h1 className="an-unsub__title">You&apos;re unsubscribed</h1>
            <p className="an-unsub__text">
              You won&apos;t get announcement emails. Announcements still show in your Notifications when you sign in.
            </p>
            <div className="cr-actions">
              <button type="button" className="cr-btn" disabled={busy} onClick={() => void run(true)}>
                {busy ? "…" : "Undo"}
              </button>
            </div>
          </>
        ) : state === "resubscribed" ? (
          <>
            <h1 className="an-unsub__title">You&apos;re subscribed again</h1>
            <p className="an-unsub__text">You&apos;ll get announcement emails again.</p>
            <div className="cr-actions">
              <button type="button" className="cr-btn" disabled={busy} onClick={() => void run(false)}>
                {busy ? "…" : "Unsubscribe"}
              </button>
            </div>
          </>
        ) : state === "invalid" ? (
          <>
            <h1 className="an-unsub__title">This link isn&apos;t valid</h1>
            <p className="an-unsub__text">Use the unsubscribe link from the most recent announcement email.</p>
          </>
        ) : (
          <>
            <h1 className="an-unsub__title">Something went wrong</h1>
            <p className="an-unsub__text">Nothing changed. Check your connection and try again.</p>
            <div className="cr-actions">
              <button type="button" className="cr-btn" disabled={busy} onClick={() => void run(false)}>
                Try again
              </button>
            </div>
          </>
        )}
        <Link to="/home" className="cr-link">
          Go to the app
        </Link>
      </div>
    </main>
  );
}
