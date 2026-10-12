import type { DemoTourStop } from "./demoMode";

export type TourRect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
export type TourPlacement = { left: number; top: number; side: "top" | "bottom" | "left" | "right" | null; arrow: number };

/** Use real controls, not navigation avatars or the tour's own links. */
export function findTourTarget(id: DemoTourStop["id"], ownId?: string): HTMLElement | null {
  const selectors: Record<DemoTourStop["id"], string> = {
    directory: '.search-page__career-toolbar input',
    profile: '.profile-page__header, a[href^="/profiles/"]',
    city: '.cities-redesign__quick-card:nth-child(2)',
    map: '.cities-v2__popular-strip',
  };
  return Array.from(document.querySelectorAll<HTMLElement>(selectors[id])).find((el) => {
    if (el.closest('nav, .demo-tour') || (ownId && el.getAttribute('href') === `/profiles/${ownId}`)) return false;
    const style = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }) ?? null;
}

/** Clamp to a usable viewport and keep the card outside the highlighted target. */
export function placeTour(target: TourRect | null, width: number, height: number, viewport: { width: number; height: number }, safeTop = 16): TourPlacement {
  const gap = 14;
  const margin = 16;
  const maxLeft = Math.max(margin, viewport.width - width - margin);
  const maxTop = Math.max(safeTop, viewport.height - height - margin);
  const clampX = (x: number) => Math.min(maxLeft, Math.max(margin, x));
  const clampY = (y: number) => Math.min(maxTop, Math.max(safeTop, y));
  const fallback: TourPlacement = { left: maxLeft, top: safeTop, side: null, arrow: 0 };
  if (!target || target.bottom <= safeTop || target.top >= viewport.height - margin || target.right <= margin || target.left >= viewport.width - margin) return fallback;
  const cx = (target.left + target.right) / 2;
  const cy = (target.top + target.bottom) / 2;
  const candidates: TourPlacement[] = [
    { left: clampX(cx - width / 2), top: target.bottom + gap, side: 'top', arrow: 0 },
    { left: clampX(cx - width / 2), top: target.top - height - gap, side: 'bottom', arrow: 0 },
    { left: target.right + gap, top: clampY(cy - height / 2), side: 'left', arrow: 0 },
    { left: target.left - width - gap, top: clampY(cy - height / 2), side: 'right', arrow: 0 },
  ];
  const result = candidates.find((p) => p.left >= margin && p.top >= safeTop && p.left + width <= viewport.width - margin && p.top + height <= viewport.height - margin);
  if (!result) return { ...fallback, top: clampY(viewport.height - height - margin) };
  const horizontal = result.side === 'top' || result.side === 'bottom';
  result.arrow = Math.max(20, Math.min((horizontal ? width : height) - 20, horizontal ? cx - result.left : cy - result.top));
  return result;
}
