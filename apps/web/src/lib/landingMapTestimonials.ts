/** Geographic pin + copy for login / landing hero map testimonials. */
export type LandingMapTestimonial = {
  id: string;
  city: string;
  lat: number;
  lon: number;
  quote: string;
  /** e.g. "Arjun '17, Product Manager" */
  attribution: string;
};

/** Four global hubs — coordinates match `World_Map_Vns.html` destination projection. */
export const LANDING_MAP_TESTIMONIALS: readonly LandingMapTestimonial[] = [
  {
    id: "bengaluru",
    city: "Bengaluru",
    lat: 12.9,
    lon: 77.6,
    quote:
      "Was looking for a technical cofounder for six months. Found a BHU alum through the network. We've been building together for eight months now.",
    attribution: "Mihir '18, Founder",
  },
  {
    id: "dubai",
    city: "Dubai",
    lat: 25.2,
    lon: 55.2,
    quote:
      "Moved to Dubai knowing nobody. Messaged three alumni here on a whim. One of them is now my flatmate.",
    attribution: "Tanvi '21, UX Designer",
  },
  {
    id: "san-francisco",
    city: "San Francisco",
    lat: 37.7,
    lon: -122.4,
    quote:
      "Had an interview in two weeks. Found an alum there, jumped on a 30 minute call. Knew exactly what to prepare. Cleared all four rounds.",
    attribution: "Ishaan '22, Software Engineer",
  },
  {
    id: "london",
    city: "London",
    lat: 51.5,
    lon: -0.12,
    quote: "Got a referral in 3 days through an alum I had never spoken to.",
    attribution: "Arjun '17, Product Manager",
  },
] as const;

/** How long each pin stays expanded before moving to the next. */
export const LANDING_MAP_TESTIMONIAL_EXPAND_MS = 4000;

export type LandingMapTestimonialPinCoord = {
  id: string;
  lat: number;
  lon: number;
  /** Matches `destinations[].name` in World_Map_Vns.html for label de-duplication. */
  city: string;
};

/** Canvas featured labels that overlap testimonial pins (skip on map when pins are active). */
export const LANDING_MAP_CANVAS_FEATURED_CITIES = ["Bengaluru", "San Francisco", "London"] as const;

export function landingMapTestimonialPinCoords(): LandingMapTestimonialPinCoord[] {
  return LANDING_MAP_TESTIMONIALS.map(({ id, lat, lon, city }) => ({ id, lat, lon, city }));
}
