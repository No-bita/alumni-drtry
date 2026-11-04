/**
 * Viewport-aware placement for the Wall "Topics" filter popover.
 *
 * The popover must stay inside the usable band between the fixed top toolbar
 * and the fixed bottom dock (phone only), opening downward when there is room
 * and upward otherwise, capping its height (with internal scrolling) when the
 * full list fits on neither side.
 */

export type RectLike = { top: number; bottom: number; left: number; right: number };

export type TopicsFilterPlacementInput = {
  /** Trigger button rect in viewport coordinates. */
  trigger: RectLike;
  viewportWidth: number;
  viewportHeight: number;
  /** Bottom edge of the fixed top toolbar; 0 when absent. */
  bandTop: number;
  /** Top edge of the fixed bottom dock; viewportHeight when absent. */
  bandBottom: number;
  /** Uncapped menu height (rows + padding + border). */
  naturalHeight: number;
  /** Gap between trigger and menu. */
  gap?: number;
};

export type TopicsFilterPlacement = {
  side: "below" | "above";
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

export const TOPICS_FILTER_GAP = 6;
export const TOPICS_FILTER_MAX_WIDTH = 300;
/** Viewport side allowance, preserving the old calc(100vw - 68px) width floor. */
export const TOPICS_FILTER_SIDE_ALLOWANCE = 34;
const MIN_EDGE = 12;

export function computeTopicsFilterPlacement(input: TopicsFilterPlacementInput): TopicsFilterPlacement {
  const gap = input.gap ?? TOPICS_FILTER_GAP;
  const width = Math.max(
    0,
    Math.min(TOPICS_FILTER_MAX_WIDTH, input.viewportWidth - 2 * TOPICS_FILTER_SIDE_ALLOWANCE),
  );
  const spaceBelow = input.bandBottom - input.trigger.bottom - gap;
  const spaceAbove = input.trigger.top - input.bandTop - gap;
  const fitsBelow = input.naturalHeight <= spaceBelow;
  const fitsAbove = input.naturalHeight <= spaceAbove;
  const side: "below" | "above" = fitsBelow ? "below" : fitsAbove ? "above" : spaceBelow >= spaceAbove ? "below" : "above";
  const maxHeight = Math.max(0, Math.floor(side === "below" ? spaceBelow : spaceAbove));
  const height = Math.min(input.naturalHeight, maxHeight);
  const top = side === "below" ? input.trigger.bottom + gap : input.trigger.top - gap - height;
  // Right-align to the trigger (the old right:0 menu), clamped into the viewport.
  const unclampedLeft = input.trigger.right - width;
  const left = Math.max(MIN_EDGE, Math.min(unclampedLeft, input.viewportWidth - width - MIN_EDGE));
  return {
    side,
    top: Math.round(top),
    left: Math.round(left),
    width: Math.round(width),
    maxHeight,
  };
}
