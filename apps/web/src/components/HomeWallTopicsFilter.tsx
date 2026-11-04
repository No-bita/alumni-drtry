import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { computeTopicsFilterPlacement } from "../lib/topicsFilterPlacement";

type HomeWallTopicsFilterProps<T extends string> = {
  topics: Array<{ id: T; label: string }>;
  counts: Record<string, number>;
  activeCategory: string;
  onCategoryChange: (id: T | "all") => void;
};

/** Matches .home-wall-topics__menu rows: 6px padding top/bottom + 2px border + 46px min-height per row. */
const ESTIMATED_ROW_HEIGHT = 46;
const ESTIMATED_CHROME = 14;

function measureViewportBands(): { bandTop: number; bandBottom: number } {
  let bandTop = 0;
  let bandBottom = window.innerHeight;
  const toolbar = document.querySelector(".nav-app-toolbar");
  if (toolbar) {
    const r = toolbar.getBoundingClientRect();
    const cs = getComputedStyle(toolbar);
    if ((cs.position === "fixed" || cs.position === "sticky") && r.height > 0) bandTop = r.bottom;
  }
  const dock = document.querySelector(".nav-bottom-dock");
  if (dock) {
    const cs = getComputedStyle(dock);
    const r = dock.getBoundingClientRect();
    if (cs.display !== "none" && r.height > 0) bandBottom = r.top;
  }
  return { bandTop, bandBottom };
}

/**
 * "Topics" filter for The Wall. Opens a detached, viewport-aware popover that
 * stays clear of the fixed top toolbar and the phone bottom dock: downward
 * when the list fits below, upward when it fits above, otherwise toward the
 * roomier side with a capped, internally scrolling height.
 *
 * Options are toggle buttons (aria-pressed), not menuitems: Tab reaches them,
 * Escape / outside tap closes, selection closes and returns focus.
 */
export function HomeWallTopicsFilter<T extends string>({ topics, counts, activeCategory, onCategoryChange }: HomeWallTopicsFilterProps<T>) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const naturalHeightRef = useRef(0);
  const triggerId = useId();
  const panelId = useId();

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const estimated = topics.length * ESTIMATED_ROW_HEIGHT + ESTIMATED_CHROME;
    const natural = naturalHeightRef.current > 0 ? naturalHeightRef.current : estimated;
    const { bandTop, bandBottom } = measureViewportBands();
    const placement = computeTopicsFilterPlacement({
      trigger: trigger.getBoundingClientRect(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      bandTop,
      bandBottom,
      naturalHeight: natural,
    });
    setPanelStyle({
      position: "fixed",
      top: `${placement.top}px`,
      left: `${placement.left}px`,
      width: `${placement.width}px`,
      maxHeight: `${placement.maxHeight}px`,
    });
  }, [topics.length]);

  // Measure the uncapped panel once it mounts, then place it (before paint).
  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (panel && naturalHeightRef.current === 0) {
      naturalHeightRef.current = panel.scrollHeight;
    }
    place();
  }, [open, place]);

  // Keep the panel attached to the trigger while the page scrolls / resizes.
  useEffect(() => {
    if (!open) return;
    const onChange = () => place();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [open, place]);

  // Move focus into the panel on open (the portal breaks natural tab order).
  useEffect(() => {
    if (!open || !panelStyle) return;
    panelRef.current?.querySelector("button")?.focus();
  }, [open, panelStyle]);

  // Escape and outside pointer close.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: Event) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return (
    <div ref={rootRef} className={`home-wall-topics${open ? " home-wall-topics--open" : ""}`}>
      <button
        type="button"
        id={triggerId}
        ref={triggerRef}
        className="home-wall-topics__trigger"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="home-wall-topics__caret" aria-hidden>▾</span>
        Topics
      </button>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="group"
              aria-label="Opportunity filters"
              className="home-wall-topics__menu home-wall-topics__menu--floating"
              style={panelStyle ?? { position: "fixed", top: "-10000px", left: "-10000px", visibility: "hidden" }}
            >
              {topics.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  aria-pressed={activeCategory === topic.id}
                  onClick={() => {
                    onCategoryChange(activeCategory === topic.id ? "all" : topic.id);
                    close(true);
                  }}
                >
                  <span>{topic.label}</span>
                  <span>{counts[topic.id] ?? 0}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
