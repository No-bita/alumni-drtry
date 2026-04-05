/** Approximate WGS84 → % positions for equirectangular placement inside the lens map frame. */

export type MapPoint = { xPct: number; yPct: number };

const CITY_COORDS: Record<string, MapPoint> = {};

function key(city: string, country: string): string {
  return `${city.trim().toLowerCase()}|${country.trim().toLowerCase()}`;
}

function reg(city: string, country: string, lat: number, lng: number): void {
  CITY_COORDS[key(city, country)] = {
    xPct: ((lng + 180) / 360) * 100,
    yPct: ((90 - lat) / 180) * 100,
  };
}

// Top cities + common directory locations (extend as needed)
reg("Bengaluru", "India", 12.97, 77.59);
reg("Mumbai", "India", 19.08, 72.88);
reg("Delhi", "India", 28.61, 77.21);
reg("Hyderabad", "India", 17.39, 78.49);
reg("San Francisco", "United States", 37.77, -122.42);
reg("New York", "United States", 40.71, -74.01);
reg("London", "United Kingdom", 51.51, -0.13);
reg("Boston", "United States", 42.36, -71.06);
reg("Singapore", "Singapore", 1.35, 103.82);
reg("Dubai", "United Arab Emirates", 25.2, 55.27);
reg("Berlin", "Germany", 52.52, 13.41);
reg("Tokyo", "Japan", 35.68, 139.65);
reg("Chennai", "India", 13.08, 80.28);
reg("Pune", "India", 18.52, 73.86);
reg("Kolkata", "India", 22.57, 88.36);
reg("Bangalore", "India", 12.97, 77.59);

/** Country centroids for unknown cities (rough). */
const COUNTRY_CENTROID: Record<string, MapPoint> = {
  india: { xPct: 71, yPct: 42 },
  "united states": { xPct: 22, yPct: 42 },
  "united kingdom": { xPct: 48, yPct: 36 },
  singapore: { xPct: 78.7, yPct: 58 },
  "united arab emirates": { xPct: 56, yPct: 52 },
  germany: { xPct: 51, yPct: 38 },
  japan: { xPct: 86, yPct: 44 },
  canada: { xPct: 18, yPct: 32 },
  australia: { xPct: 85, yPct: 72 },
  france: { xPct: 49, yPct: 40 },
  china: { xPct: 78, yPct: 46 },
  brazil: { xPct: 32, yPct: 68 },
};

export function mapPointForCity(city: string, country: string): MapPoint {
  const exact = CITY_COORDS[key(city, country)];
  if (exact) return exact;
  const co = country.trim().toLowerCase();
  return COUNTRY_CENTROID[co] ?? { xPct: 50, yPct: 45 };
}

export function bubbleRadiusPx(count: number, maxCount: number): number {
  if (maxCount <= 0) return 10;
  const t = Math.sqrt(Math.max(0, count) / maxCount);
  return 8 + t * 36;
}
