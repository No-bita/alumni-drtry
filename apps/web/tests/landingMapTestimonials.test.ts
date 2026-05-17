import { describe, expect, it } from "vitest";
import {
  LANDING_MAP_CANVAS_FEATURED_CITIES,
  LANDING_MAP_TESTIMONIALS,
  landingMapTestimonialPinCoords,
} from "../src/lib/landingMapTestimonials";

describe("landingMapTestimonials", () => {
  it("sends city names on pins so canvas can skip duplicate labels", () => {
    const coords = landingMapTestimonialPinCoords();
    expect(coords).toHaveLength(4);
    expect(coords.every((p) => typeof p.city === "string" && p.city.length > 0)).toBe(true);
  });

  it("documents canvas featured cities that must be de-duplicated against pins", () => {
    const testimonialCities = new Set(LANDING_MAP_TESTIMONIALS.map((t) => t.city));
    const overlapping = LANDING_MAP_CANVAS_FEATURED_CITIES.filter((city) =>
      testimonialCities.has(city)
    );
    expect(overlapping).toEqual(["Bengaluru", "San Francisco", "London"]);
  });
});
