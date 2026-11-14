import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import "./FoldToFlight.css";
import { stripAppBase } from "../lib/appBase";

/** Full-screen loading visual. Entry remains driven only by the real session/route readiness. */
export function FoldToFlight({ ready }: { ready: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setSlow(true), 5_000);
    return () => {
      window.clearTimeout(timer);
      setSlow(false); // each new loading interval starts its own wait
    };
  }, [ready]);
  return (
    <main className="fold-flight" aria-label="Opening Alma">
      <div className="fold-flight__brand">Alma Mater</div>
      <div className="fold-flight__play" aria-hidden="true">
        <div className="fold-flight__dots" />
      </div>
      <div className="fold-flight__status">
        <p role="status" aria-live="polite" aria-atomic="true">
          {slow ? "This is taking longer than expected." : "Opening Alma..."}
        </p>
        {slow ? <>
          <p className="fold-flight__detail">Still waiting for Alma to open. You can reload and try again.</p>
          <button type="button" className="fold-flight__again" onClick={() => window.location.reload()}>Reload Alma</button>
        </> : null}
      </div>
    </main>
  );
}

function RouteReady({ locationKey, onReady, children }: { locationKey: string; onReady: (key: string) => void; children: ReactNode }) {
  useEffect(() => {
    // A redirect starts navigating in its own effect, before this one runs. The browser URL has already moved on,
    // so a page that rendered for an older location must not count as ready.
    if (locationKey && `${stripAppBase(window.location.pathname)}${window.location.search}` !== locationKey) return;
    onReady(locationKey);
  }, [locationKey, onReady]);
  return children;
}

/** Keep one loading surface mounted across session resolution and lazy-route loading. */
export function FoldToFlightGate({ sessionReady, locationKey = "", children }: { sessionReady: boolean; locationKey?: string; children: ReactNode }) {
  // Readiness belongs to the current location, so a redirect that is still lazy-loading is not ready.
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);
  // Enter automatically once the session and the current destination are really ready. Sticky, so a later
  // lazy route never brings the loading surface back.
  const ready = sessionReady && readyKey === locationKey;
  if (ready && !entered) setEntered(true);
  // React's stable state setter lets the marker signal once the destination's Suspense resolves.
  const markReady = useCallback((key: string) => setReadyKey(key), []);
  return <>
    {!entered && <FoldToFlight ready={ready} />}
    {sessionReady && <div hidden={!entered} inert={!entered}>
      <Suspense fallback={null}><RouteReady locationKey={locationKey} onReady={markReady}>{children}</RouteReady></Suspense>
    </div>}
  </>;
}
