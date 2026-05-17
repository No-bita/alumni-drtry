export type LayoutRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type LandingMapCollisionState = {
  /** Dock anchored to top of map panel (avoids bottom collision with sign-in card). */
  dockAnchor: "bottom" | "top";
  /** Extra inset (px) reserved at bottom of pin layer for dock + safety margin. */
  pinLayerBottomPx: number;
  /** Extra inset (px) reserved at top of pin layer when dock is top-anchored. */
  pinLayerTopPx: number;
  /** True when dock was adjusted due to overlap with another hero element. */
  hadCollision: boolean;
};

const DEFAULT_PIN_LAYER_BOTTOM_PX = 88;
const DOCK_SAFETY_PX = 12;
const OBSTACLE_PADDING_PX = 10;

export function measureLayoutRect(el: Element | null | undefined): LayoutRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return null;
  return {
    top: r.top,
    left: r.left,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
  };
}

export function rectsOverlap(a: LayoutRect, b: LayoutRect, padding = 0): boolean {
  return !(
    a.right + padding <= b.left ||
    a.left - padding >= b.right ||
    a.bottom + padding <= b.top ||
    a.top - padding >= b.bottom
  );
}

function overlapsAny(rect: LayoutRect, obstacles: LayoutRect[], padding: number): boolean {
  return obstacles.some((o) => rectsOverlap(rect, o, padding));
}

/**
 * Picks dock placement and pin-layer inset so the testimonial dock avoids hero copy
 * and the sign-in card while staying inside the map panel.
 */
export function resolveLandingMapCollisions(params: {
  mapRect: LayoutRect | null;
  dockRect: LayoutRect | null;
  obstacles: LayoutRect[];
}): LandingMapCollisionState {
  const fallback: LandingMapCollisionState = {
    dockAnchor: "bottom",
    pinLayerBottomPx: DEFAULT_PIN_LAYER_BOTTOM_PX,
    pinLayerTopPx: 0,
    hadCollision: false,
  };

  const { mapRect, dockRect } = params;
  const obstacles = params.obstacles.filter((r) => r.width > 0 && r.height > 0);
  if (!mapRect || !dockRect || obstacles.length === 0) return fallback;

  const dockHeight = dockRect.height;
  const bottomAnchorRect: LayoutRect = {
    ...dockRect,
    top: mapRect.bottom - dockHeight - DOCK_SAFETY_PX,
    bottom: mapRect.bottom - DOCK_SAFETY_PX,
  };
  const topAnchorRect: LayoutRect = {
    ...dockRect,
    top: mapRect.top + DOCK_SAFETY_PX,
    bottom: mapRect.top + dockHeight + DOCK_SAFETY_PX,
  };

  const bottomBlocked = overlapsAny(bottomAnchorRect, obstacles, OBSTACLE_PADDING_PX);
  const pinInset = Math.ceil(dockHeight + DOCK_SAFETY_PX * 2);

  if (!bottomBlocked) {
    return {
      dockAnchor: "bottom",
      pinLayerBottomPx: pinInset,
      pinLayerTopPx: 0,
      hadCollision: false,
    };
  }

  const topBlocked = overlapsAny(topAnchorRect, obstacles, OBSTACLE_PADDING_PX);
  if (!topBlocked) {
    return {
      dockAnchor: "top",
      pinLayerBottomPx: DEFAULT_PIN_LAYER_BOTTOM_PX,
      pinLayerTopPx: pinInset,
      hadCollision: true,
    };
  }

  return {
    dockAnchor: "top",
    pinLayerBottomPx: pinInset,
    pinLayerTopPx: pinInset,
    hadCollision: true,
  };
}
