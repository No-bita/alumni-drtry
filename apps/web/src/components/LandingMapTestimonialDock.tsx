import type { LandingMapTestimonial } from "../lib/landingMapTestimonials";

type Props = {
  testimonial: LandingMapTestimonial;
  dockAnchor: "bottom" | "top";
};

export function LandingMapTestimonialDock({ testimonial, dockAnchor }: Props) {
  return (
    <div
      className={[
        "landing-map-testimonial-dock",
        dockAnchor === "top" ? "landing-map-testimonial-dock--anchor-top" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="region"
      aria-label="Alumni testimonial"
    >
      <p className="landing-map-testimonial-dock__city">{testimonial.city}</p>
      <blockquote className="landing-map-testimonial-dock__quote">
        <p>{testimonial.quote}</p>
        <cite>{testimonial.attribution}</cite>
      </blockquote>
    </div>
  );
}
