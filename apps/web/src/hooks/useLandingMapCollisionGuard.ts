import { useEffect, useState, type RefObject } from "react";
import {
  measureLayoutRect,
  resolveLandingMapCollisions,
  type LandingMapCollisionState,
} from "../lib/landingMapLayoutGuard";

const DEFAULT_STATE: LandingMapCollisionState = {
  dockAnchor: "bottom",
  pinLayerBottomPx: 88,
  pinLayerTopPx: 0,
  hadCollision: false,
};

type Options = {
  enabled: boolean;
  dockVisible: boolean;
};

/**
 * Measures map vs hero copy / sign-in card and returns safe dock + pin-layer placement.
 */
export function useLandingMapCollisionGuard(
  mapRootRef: RefObject<HTMLElement | null>,
  options: Options
): LandingMapCollisionState {
  const [state, setState] = useState<LandingMapCollisionState>(DEFAULT_STATE);

  useEffect(() => {
    if (!options.enabled) {
      setState(DEFAULT_STATE);
      return;
    }

    const mapRoot = mapRootRef.current;
    if (!mapRoot) return;

    let frame = 0;

    const measure = () => {
      const hero = mapRoot.closest(".auth-merged__hero");
      const dockEl = mapRoot.querySelector<HTMLElement>(".landing-map-testimonial-dock");
      const dockRect = measureLayoutRect(dockEl);

      const obstacles = [
        measureLayoutRect(hero?.querySelector(".auth-merged__hero-copy") ?? null),
        measureLayoutRect(hero?.querySelector(".auth-merged__card-mount") ?? null),
      ].filter((r): r is NonNullable<typeof r> => r != null);

      const next = resolveLandingMapCollisions({
        mapRect: measureLayoutRect(mapRoot),
        dockRect,
        obstacles,
      });

      setState((prev) =>
        prev.dockAnchor === next.dockAnchor &&
        prev.pinLayerBottomPx === next.pinLayerBottomPx &&
        prev.pinLayerTopPx === next.pinLayerTopPx &&
        prev.hadCollision === next.hadCollision
          ? prev
          : next
      );
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    schedule();

    const ro = new ResizeObserver(schedule);
    ro.observe(mapRoot);
    const hero = mapRoot.closest(".auth-merged__hero");
    if (hero) ro.observe(hero);
    window.addEventListener("resize", schedule);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [mapRootRef, options.enabled, options.dockVisible]);

  return state;
}
