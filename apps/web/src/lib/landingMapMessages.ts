import type { LandingMapTestimonialPinCoord } from "./landingMapTestimonials";

export const LANDING_MAP_SET_TESTIMONIALS = "landing-map-set-testimonials" as const;
export const LANDING_MAP_PIN_LAYOUT = "landing-map-pin-layout" as const;
export const LANDING_MAP_READY = "landing-map-ready" as const;

export type LandingMapSetTestimonialsMessage = {
  type: typeof LANDING_MAP_SET_TESTIMONIALS;
  pins: LandingMapTestimonialPinCoord[];
};

export type LandingMapPinLayoutMessage = {
  type: typeof LANDING_MAP_PIN_LAYOUT;
  iframeWidth: number;
  iframeHeight: number;
  canvas: { left: number; top: number; width: number; height: number };
  pins: Array<{ id: string; x: number; y: number }>;
};

export type LandingMapReadyMessage = {
  type: typeof LANDING_MAP_READY;
};

export type LandingMapIframeMessage = LandingMapPinLayoutMessage | LandingMapReadyMessage;

export function isLandingMapIframeMessage(data: unknown): data is LandingMapIframeMessage {
  if (!data || typeof data !== "object") return false;
  const type = (data as { type?: unknown }).type;
  return type === LANDING_MAP_PIN_LAYOUT || type === LANDING_MAP_READY;
}
