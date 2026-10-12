import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { findTourTarget, placeTour, tourMaxHeight, visibleTourRect, type TourRect } from "../lib/demoTourPosition";
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
  /* Profile pages have per-person URLs, so remember the one opened during the tour. */
  const lastProfilePath = useRef<string | null>(null);

  useEffect(() => {
    if (pathname.startsWith("/profiles/")) lastProfilePath.current = pathname;
  }, [pathname]);

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

  const cardRef = useRef<HTMLElement>(null);
  const [anchor, setAnchor] = useState<{ placement: ReturnType<typeof placeTour>; target: TourRect | null } | null>(null);
  const ownId = auth.status === "authenticated" ? auth.myProfile?.id : undefined;

  useEffect(() => {
    if (tour.status !== "active") return;
    let frame = 0;
    let firstTarget = true;
    const measure = () => {
      const card = cardRef.current;
      if (!card) return;
      const bannerBottom = document.querySelector(".demo-banner")?.getBoundingClientRect().bottom ?? 0;
      const safeTop = Math.max(16, bannerBottom + 12);
      const dockClearance = window.innerWidth <= 640 ? 72 : 0;
      card.style.maxHeight = `${tourMaxHeight(window.innerHeight, safeTop, dockClearance)}px`;
      const viewport = { width: window.innerWidth, top: safeTop, bottom: window.innerHeight - dockClearance };
      const el = findTourTarget(stop.id, ownId, viewport);
      const target = el ? visibleTourRect(el, viewport) : null;
      const placement = placeTour(target, card.offsetWidth, card.offsetHeight, { width: window.innerWidth, height: window.innerHeight - dockClearance }, safeTop);
      // On a new stop, make room below a visible target on short screens.
      // Do this once only, so manual scrolling remains under the visitor's control.
      if (target && firstTarget) {
        firstTarget = false;
        if (!placement.side && target.bottom - target.top + card.offsetHeight + 30 < window.innerHeight - safeTop - 72) {
          window.scrollBy({ top: target.top - safeTop - 8, behavior: "instant" });
          frame = requestAnimationFrame(measure);
          return;
        }
      }
      setAnchor((prev) => JSON.stringify(prev) === JSON.stringify({ placement, target }) ? prev : { placement, target });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const mutation = new MutationObserver(schedule);
    mutation.observe(document.body, { childList: true, subtree: true });
    const resize = new ResizeObserver(schedule);
    if (cardRef.current) resize.observe(cardRef.current);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      mutation.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [stop.id, pathname, tour.status, ownId]);

  const goTo = (nextStep: number) => {
    const s = clampStep(nextStep);
    update({ status: "active", step: s });
    const path = DEMO_TOUR_STOPS[s].path;
    if (path && pathname !== path) {
      navigate(path);
    } else if (!path && s < step && lastProfilePath.current && pathname !== lastProfilePath.current) {
      /* Going Back onto the profile stop: return to the profile that was opened. */
      navigate(lastProfilePath.current);
    }
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
        <>
        {anchor?.target ? <div className="demo-tour-target" aria-hidden style={{ left: anchor.target.left, top: anchor.target.top, width: anchor.target.width, height: anchor.target.height, boxShadow: "inset 0 0 0 4px rgba(212, 154, 74, 0.25)" }} /> : null}
        <aside ref={cardRef} className="demo-tour" role="dialog" aria-label="Guided tour" aria-live="polite"
          style={anchor ? { left: anchor.placement.left, top: anchor.placement.top } : undefined}>
          {anchor?.placement.side ? <span className={`demo-tour__arrow demo-tour__arrow--${anchor.placement.side}`} aria-hidden style={anchor.placement.side === "top" || anchor.placement.side === "bottom" ? { left: anchor.placement.arrow } : { top: anchor.placement.arrow }} /> : null}
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
        </>
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
