export type TopCityPick = { city: string; country: string };

/** Fallback when `GET /v1/directory/residence-cities` fails (e.g. offline). */
export const LOCATION_LENS_TOP_CITIES_FALLBACK: TopCityPick[] = [
  { city: "Bengaluru", country: "India" },
  { city: "Mumbai", country: "India" },
  { city: "Delhi", country: "India" },
  { city: "Hyderabad", country: "India" },
  { city: "San Francisco", country: "United States" },
  { city: "New York", country: "United States" },
  { city: "London", country: "United Kingdom" },
  { city: "Boston", country: "United States" },
  { city: "Singapore", country: "Singapore" },
  { city: "Dubai", country: "United Arab Emirates" },
  { city: "Berlin", country: "Germany" },
  { city: "Tokyo", country: "Japan" },
];
