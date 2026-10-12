import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  DEMO_BLOCKED_EVENT,
  DEMO_BLOCKED_MESSAGE,
  DEMO_TOUR_STOPS,
  clampStep,
  getTourStorage,
  isDemoPerson,
  readDemoTourState,
  writeDemoTourState,
  type DemoTourState,
} from "../lib/demoMode";
import "../styles/demo.css";

/** Banner, guided tour and "that's disabled" notices. Renders nothing outside demo sessions. */
export function DemoExperience() {
  const auth = useAuth();
  const isDemo = auth.status === "authenticated" && isDemoPerson(auth.person);
  if (!isDemo) return null;
  return <DemoExperienceInner />;
}

function DemoExperienceInner() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [tour, setTour] = useState<DemoTourState>(
    () => readDemoTourState(getTourStorage()) ?? { status: "active", step: 0 }
  );
  const [notice, setNotice] = useState(false);

  const update = useCallback((next: DemoTourState) => {
    setTour(next);
    writeDemoTourState(getTourStorage(), next);
  }, []);

  /* First visit in this browser session: persist the starting state. */
  useEffect(() => {
    if (!readDemoTourState(getTourStorage())) {
      writeDemoTourState(getTourStorage(), { status: "active", step: 0 });
    }
  }, []);

  /* Disabled-action explanation: any demo-blocked API response lands here. */
  useEffect(() => {
    let timer: number | undefined;
    const onBlocked = () => {
      setNotice(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setNotice(false), 6000);
    };
    window.addEventListener(DEMO_BLOCKED_EVENT, onBlocked);
    return () => {
      window.removeEventListener(DEMO_BLOCKED_EVENT, onBlocked);
      window.clearTimeout(timer);
    };
  }, []);

  const step = clampStep(tour.step);
  const stop = DEMO_TOUR_STOPS[step];

  const goTo = (nextStep: number) => {
    const s = clampStep(nextStep);
    update({ status: "active", step: s });
    const path = DEMO_TOUR_STOPS[s].path;
    if (path && pathname !== path) navigate(path);
  };

  const openFirstProfile = () => {
    const ownId = auth.status === "authenticated" ? auth.myProfile?.id : undefined;
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href^="/profiles/"]')
    ).filter((a) => !a.closest("nav") && (!ownId || !a.getAttribute("href")?.endsWith(`/${ownId}`)));
    if (links[0]) {
      links[0].click();
    } else {
      navigate("/search");
    }
  };

  const signOut = async () => {
    await auth.logout();
    navigate("/login", { replace: true });
  };

  const isLast = step === DEMO_TOUR_STOPS.length - 1;

  return (
    <>
      <div className="demo-banner" role="region" aria-label="Demo mode">
        <span className="demo-banner__text">
          <strong>Demo mode.</strong> You&apos;re exploring with made-up alumni. Look, click, wander.
        </span>
        <span className="demo-banner__actions">
          <button type="button" className="demo-banner__btn" onClick={() => goTo(0)}>
            {tour.status === "active" ? "Restart tour" : "Replay tour"}
          </button>
          <button type="button" className="demo-banner__btn" onClick={() => void signOut()}>
            Leave demo
          </button>
        </span>
      </div>

      {tour.status === "active" ? (
        <aside className="demo-tour" role="dialog" aria-label="Guided tour" aria-live="polite">
          <p className="demo-tour__count">
            Stop {step + 1} of {DEMO_TOUR_STOPS.length}
          </p>
          <h2 className="demo-tour__title">{stop.title}</h2>
          <p className="demo-tour__body">{stop.body}</p>
          {stop.id === "profile" ? (
            <button type="button" className="demo-tour__link" onClick={openFirstProfile}>
              Show me one
            </button>
          ) : null}
          <div className="demo-tour__dots" aria-hidden>
            {DEMO_TOUR_STOPS.map((s, i) => (
              <span key={s.id} className={i === step ? "demo-tour__dot demo-tour__dot--on" : "demo-tour__dot"} />
            ))}
          </div>
          <div className="demo-tour__row">
            <button
              type="button"
              className="demo-tour__btn demo-tour__btn--ghost"
              onClick={() => update({ status: "skipped", step })}
            >
              Skip tour
            </button>
            <span className="demo-tour__spacer" />
            {step > 0 ? (
              <button type="button" className="demo-tour__btn demo-tour__btn--ghost" onClick={() => goTo(step - 1)}>
                Back
              </button>
            ) : null}
            <button
              type="button"
              className="demo-tour__btn"
              onClick={() => (isLast ? update({ status: "done", step }) : goTo(step + 1))}
            >
              {isLast ? "Finish" : "Next"}
            </button>
          </div>
        </aside>
      ) : null}

      {notice ? (
        <div className="demo-notice" role="status" aria-live="polite">
          <p>{DEMO_BLOCKED_MESSAGE}</p>
          <button type="button" className="demo-notice__close" onClick={() => setNotice(false)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ) : null}
    </>
  );
}
