import { useMemo } from "react";
import {
  LANDING_MAP_TESTIMONIALS,
  type LandingMapTestimonial,
} from "../lib/landingMapTestimonials";
import type { LandingMapPinLayoutMessage } from "../lib/landingMapMessages";
import { useLandingMapTestimonialCycle } from "../hooks/useLandingMapTestimonialCycle";
import { usePhoneViewport } from "../hooks/usePhoneViewport";
import { LandingMapTestimonialDock } from "./LandingMapTestimonialDock";
import type { LandingMapCollisionState } from "../lib/landingMapLayoutGuard";

type PinScreenPosition = {
  testimonial: LandingMapTestimonial;
  leftPct: number;
  topPct: number;
};

type Props = {
  layout: LandingMapPinLayoutMessage | null;
  mapReady: boolean;
  reducedMotion: boolean;
  className?: string;
  dockAnchor?: LandingMapCollisionState["dockAnchor"];
};

function buildPinPositions(layout: LandingMapPinLayoutMessage): PinScreenPosition[] {
  const { canvas, pins } = layout;
  const byId = new Map(pins.map((p) => [p.id, p]));

  return LANDING_MAP_TESTIMONIALS.flatMap((testimonial) => {
    const pin = byId.get(testimonial.id);
    if (!pin) return [];
    const leftPct = ((canvas.left + pin.x) / layout.iframeWidth) * 100;
    const topPct = ((canvas.top + pin.y) / layout.iframeHeight) * 100;
    return [{ testimonial, leftPct, topPct }];
  });
}

export function LandingMapTestimonialPins({
  layout,
  mapReady,
  reducedMotion,
  className,
  dockAnchor = "bottom",
}: Props) {
  const isPhone = usePhoneViewport();
  const positions = useMemo(() => (layout ? buildPinPositions(layout) : []), [layout]);
  const testimonials = useMemo(
    () => (positions.length > 0 ? positions.map((p) => p.testimonial) : [...LANDING_MAP_TESTIMONIALS]),
    [positions]
  );

  const cycleEnabled = mapReady && testimonials.length > 0 && !reducedMotion;
  const [activeIndex] = useLandingMapTestimonialCycle(testimonials.length, cycleEnabled);

  if (testimonials.length === 0) return null;

  const active = testimonials[activeIndex] ?? testimonials[0];
  const showExpanded = mapReady || reducedMotion;

  if (isPhone) {
    return (
      <div
        className={[
          "landing-map-testimonials",
          "landing-map-testimonials--mobile-dock",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="Alumni testimonials"
      >
        <p className="visually-hidden" aria-live="polite">
          {active ? `${active.city}: ${active.quote}` : ""}
        </p>
        {mapReady || reducedMotion ? (
          <LandingMapTestimonialDock testimonial={active} dockAnchor={dockAnchor} />
        ) : null}
      </div>
    );
  }

  if (!layout || positions.length === 0) return null;

  const activeId = active?.id;

  return (
    <div
      className={["landing-map-testimonials", "landing-map-testimonials--map-pins", className]
        .filter(Boolean)
        .join(" ")}
      aria-label="Alumni testimonials on the map"
    >
      <p className="visually-hidden" aria-live="polite">
        {active ? `${active.city}: ${active.quote}` : ""}
      </p>

      {positions.map(({ testimonial, leftPct, topPct }) => {
        const expanded = showExpanded
          ? reducedMotion
            ? testimonial.id === positions[0]?.testimonial.id
            : testimonial.id === activeId
          : false;
        const expandLeft = leftPct > 58;
        const expandUp = topPct > 62;

        return (
          <div
            key={testimonial.id}
            className={[
              "landing-map-pin",
              expanded ? "landing-map-pin--expanded" : "landing-map-pin--collapsed",
              expandLeft ? "landing-map-pin--expand-left" : "landing-map-pin--expand-right",
              expandUp ? "landing-map-pin--expand-up" : "landing-map-pin--expand-down",
            ].join(" ")}
            style={{ left: `${leftPct}%`, top: `${topPct}%` }}
          >
            <span className="landing-map-pin__dot" aria-hidden />
            <span className="landing-map-pin__city">{testimonial.city}</span>
            <blockquote className="landing-map-pin__card">
              <p>{testimonial.quote}</p>
              <cite>{testimonial.attribution}</cite>
            </blockquote>
          </div>
        );
      })}
    </div>
  );
}
