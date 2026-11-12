export function cityEmptyExample(city: string): string {
  return city.trim().toLowerCase() === "bengaluru"
    ? "Looking for a flat in Indiranagar"
    : `Looking for a flat in ${city}`;
}
