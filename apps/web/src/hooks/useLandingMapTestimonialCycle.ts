import { useEffect, useState } from "react";
import { LANDING_MAP_TESTIMONIAL_EXPAND_MS } from "../lib/landingMapTestimonials";

export function useLandingMapTestimonialCycle(
  count: number,
  enabled: boolean
): [number, (index: number) => void] {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!enabled || count <= 1) {
      setActiveIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % count);
    }, LANDING_MAP_TESTIMONIAL_EXPAND_MS);
    return () => window.clearInterval(timer);
  }, [enabled, count]);

  return [activeIndex, setActiveIndex];
}
