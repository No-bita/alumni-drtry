import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import "./FoldToFlight.css";

const prompts = [
  ["The sheet", "Start with a fold.", "Tap the paper to fold down the middle."],
  ["The nose", "Pointy end first.", "Tap the paper to bring the corners in."],
  ["The wings", "Looks flight-ish.", "Tap the paper to fold out the wings."],
  ["Your plane", "No pilot's licence needed.", "Tap your plane to launch it."],
] as const;

function Paper({ step }: { step: number }) {
  return (
    <svg key={step} className="fold-flight__fold" viewBox="0 0 220 250" aria-hidden="true" focusable="false">
      {step === 0 ? <>
        <rect x="48" y="14" width="124" height="217" rx="3" className="fold-flight__paper" />
        <path d="M110 18V227" className="fold-flight__crease fold-flight__crease--dashed" />
        <path d="M167 108Q118 78 66 108M76 96L66 108L82 115" className="fold-flight__arrow" />
      </> : step === 1 ? <>
        <path d="M48 80L110 14L172 80V231H48Z" className="fold-flight__paper" />
        <path d="M48 80H172M110 14V231" className="fold-flight__crease" />
        <path d="M67 66L98 85M153 66L122 85M88 71L98 85L82 85M132 71L122 85L138 85" className="fold-flight__arrow" />
      </> : step === 2 ? <>
        <path d="M110 14L175 231L110 193L45 231Z" className="fold-flight__paper" />
        <path d="M110 14V193L45 231M110 193L175 231M110 14L70 218M110 14L150 218" className="fold-flight__crease" />
        <path d="M70 140L33 125M150 140L187 125M41 118L33 125L38 134M179 118L187 125L182 134" className="fold-flight__arrow" />
      </> : <>
        <path d="M22 120L201 43L140 215L101 145Z" className="fold-flight__plane" />
        <path d="M101 145L201 43L125 160L140 215" className="fold-flight__wing" />
        <path d="M22 120L101 145L201 43" className="fold-flight__paper" />
      </>}
    </svg>
  );
}

/** Local, optional play only. Readiness comes from the real session/route, never the folds. */
export function FoldToFlight({ ready, onEnter }: { ready: boolean; onEnter: () => void }) {
  const [step, setStep] = useState(0);
  const [launched, setLaunched] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setSlow(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [ready]);
  const [label, title, hint] = prompts[step];
  function play() {
    if (step < 3) setStep(step + 1);
    else setLaunched(true);
  }
  return (
    <main className="fold-flight" aria-label="Opening Alma">
      <div className="fold-flight__brand">Alma Mater</div>
      <div className="fold-flight__play">
        <button type="button" className={`fold-flight__sheet${launched ? " fold-flight__sheet--flying" : ""}`}
          onClick={play} disabled={launched} aria-label={hint}>
          <Paper step={step} />
        </button>
        <div className="fold-flight__prompt" aria-live="polite" aria-atomic="true">
          <div className="fold-flight__step">{launched ? "Airborne" : label}</div>
          <h1>{launched ? "That counts as flying." : title}</h1>
          <p>{launched ? "Not bad for a sheet of paper." : hint}</p>
        </div>
        {launched && <button type="button" className="fold-flight__again" onClick={() => { setStep(0); setLaunched(false); }}>Fold another</button>}
      </div>
      <div className="fold-flight__status">
        <p role="status" aria-live="polite" aria-atomic="true">
          {ready ? (step < 3 ? "Alma's ready. Your plane? Almost." : "Alma's ready. Your call.") : slow ? "This is taking longer than expected." : "Opening Alma..."}
        </p>
        {ready ? <>
          <button className="fold-flight__enter" type="button" onClick={onEnter}>Take me in</button>
          <p className="fold-flight__choice">Or keep {launched ? "playing" : "folding"}. Your call.</p>
        </> : slow ? <>
          <p className="fold-flight__detail">Still waiting for Alma to open. You can reload and try again.</p>
          <button type="button" className="fold-flight__again" onClick={() => window.location.reload()}>Reload Alma</button>
        </> : null}
      </div>
    </main>
  );
}

function RouteReady({ onReady, children }: { onReady: () => void; children: ReactNode }) {
  useEffect(onReady, [onReady]);
  return children;
}

/** Keep one play surface mounted across session resolution and lazy-route loading. */
export function FoldToFlightGate({ sessionReady, children }: { sessionReady: boolean; children: ReactNode }) {
  const [routeReady, setRouteReady] = useState(false);
  const [entered, setEntered] = useState(false);
  // React's stable state setter lets the marker signal once the destination's Suspense resolves.
  const markReady = useCallback(() => setRouteReady(true), []);
  return <>
    {!entered && <FoldToFlight ready={sessionReady && routeReady} onEnter={() => setEntered(true)} />}
    {sessionReady && <div hidden={!entered} inert={!entered}>
      <Suspense fallback={null}><RouteReady onReady={markReady}>{children}</RouteReady></Suspense>
    </div>}
  </>;
}
