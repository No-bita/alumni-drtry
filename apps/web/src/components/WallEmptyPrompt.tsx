import { useEffect, useRef, useState } from "react";
import { WALL_EMPTY_FINAL_TEXT, WALL_EMPTY_SESSION_KEY, buildWallEmptyScript, type WallEmptyStep } from "../lib/wallEmptyScript";

/**
 * Empty Wall: a blank post card that types three example asks, then settles on "Your post here".
 * Plays once per browser session, only once the card is on screen, and pauses while the tab is
 * hidden. With reduced motion it shows the final card straight away. The typed text is hidden
 * from screen readers; the card is a button with a fixed name that opens the post flow.
 */

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;
  } catch {
    return false;
  }
}

function alreadyPlayed(): boolean {
  try {
    return window.sessionStorage.getItem(WALL_EMPTY_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markPlayed(): void {
  try {
    window.sessionStorage.setItem(WALL_EMPTY_SESSION_KEY, "1");
  } catch {
    /* storage unavailable: it may play again next time, which is fine */
  }
}

type Props = {
  /** Opens the post flow (same as "Post to The Wall"). */
  onPost: () => void;
  /** Called once when the typing finishes on "Your post here" (not with reduced motion or a repeat view). */
  onFinished?: () => void;
};

export function WallEmptyPrompt({ onPost, onFinished }: Props) {
  // Reduced motion or already seen this session: start (and stay) on the final card.
  const [skip] = useState(() => prefersReducedMotion() || alreadyPlayed());
  const [frame, setFrame] = useState<WallEmptyStep>(() => (skip ? { text: WALL_EMPTY_FINAL_TEXT, delay: 0, final: true } : { text: "", delay: 0 }));
  const cardRef = useRef<HTMLButtonElement>(null);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    if (skip) return undefined;
    const script = buildWallEmptyScript();
    let index = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let started = false;
    let disposed = false;

    const clear = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };

    const scheduleNext = () => {
      clear();
      if (disposed || index >= script.length) return;
      if (typeof document !== "undefined" && document.hidden) return; // resumes on visibilitychange
      const step = script[index]!;
      timer = setTimeout(() => {
        timer = null;
        setFrame(step);
        index += 1;
        if (step.final) {
          onFinishedRef.current?.();
          return;
        }
        scheduleNext();
      }, index === 0 ? 0 : script[index - 1]!.delay);
    };

    const start = () => {
      if (started || disposed) return;
      started = true;
      markPlayed();
      scheduleNext();
    };

    const onVisibility = () => {
      if (!started) return;
      if (document.hidden) clear();
      else if (timer === null) scheduleNext();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let observer: IntersectionObserver | null = null;
    const card = cardRef.current;
    if (typeof IntersectionObserver === "function" && card) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            observer?.disconnect();
            start();
          }
        },
        { threshold: 0.5 },
      );
      observer.observe(card);
    } else {
      start();
    }

    return () => {
      disposed = true;
      clear();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [skip]);

  const isFinal = Boolean(frame.final);

  return (
    <div className="wall-empty">
      <button
        ref={cardRef}
        type="button"
        className={`wall-empty-card${isFinal ? " is-final" : ""}`}
        aria-label="Write your first post on The Wall"
        onClick={onPost}
      >
        {isFinal ? (
          <span className="wall-empty-card__final" aria-hidden="true">
            <span className="wall-empty-card__final-text">{WALL_EMPTY_FINAL_TEXT}</span>
            <svg className="wall-empty-card__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </span>
        ) : (
          <>
            <span className="wall-empty-card__label" aria-hidden="true">
              Example
            </span>
            <span className="wall-empty-card__text" aria-hidden="true" data-testid="wall-empty-typed">
              {frame.text}
              <span className="wall-empty-card__caret" />
            </span>
          </>
        )}
      </button>
    </div>
  );
}
