/** Stable fingerprints for ignoring dismissed cleanup suggestions. */

export function fingerprintCanonicalMerge(canonicalIdA: string, canonicalIdB: string): string {
  const [a, b] = canonicalIdA < canonicalIdB ? [canonicalIdA, canonicalIdB] : [canonicalIdB, canonicalIdA];
  return `merge:${a}:${b}`;
}

export function fingerprintUnmapped(normCountryLower: string, normCityLower: string): string {
  return `raw:${normCountryLower}:${normCityLower}`;
}
