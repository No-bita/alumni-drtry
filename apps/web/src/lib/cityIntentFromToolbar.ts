import type { ResidenceCityAggregate } from "../api/client";
import type { TopCityPick } from "../constants/locationLens";
import { LOCATION_LENS_TOP_CITIES_FALLBACK } from "../constants/locationLens";
import { normalizeQ } from "./directorySearchUrlState";

/** Mirrors location hub slug normalization (ASCII slug from display name). */
export function normalizeCityIntentSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Turn a normalized URL slug (e.g. `new-york`) into a readable city label (`New York`). */
export function humanizeCityIntentSlug(normalizedSlug: string): string {
  const trimmed = normalizedSlug.trim().replace(/^-+|-+$/g, "");
  if (!trimmed) return normalizedSlug.trim();
  return trimmed
    .split("-")
    .filter(Boolean)
    .map((word) =>
      word.length ? `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}` : ""
    )
    .filter(Boolean)
    .join(" ")
    .trim();
}

/** Catalog match + humanized `{ city, country: "" }` for any `@keyword` slug (unknown regions use empty country). */
export function pickForExplicitAtCityNavigate(
  innerKeyword: string,
  options?: { apiRows?: ResidenceCityAggregate[] },
): TopCityPick {
  const inner = normalizeQ(innerKeyword);
  const canon = matchCityPickFromIntentFragment(inner, options);
  if (canon) return canon;
  const slug = normalizeCityIntentSlug(inner);
  if (!slug.length) return { city: inner ? inner.slice(0, 80).trim() : "City hub", country: "" };
  return { city: humanizeCityIntentSlug(slug), country: "" };
}

function canonicalTopCityPick(city: string, country: string): TopCityPick {
  const countryTrimmed = country.trim();
  const cityTrimmed = city.trim();
  if (countryTrimmed.toLowerCase() === "india" && cityTrimmed.toLowerCase() === "bangalore") {
    return { city: "Bengaluru", country: countryTrimmed };
  }
  return { city: cityTrimmed, country: countryTrimmed };
}

/** Register slug → pick; adds Bangalore aliases for Bengaluru. */
function addPickSlug(map: Map<string, TopCityPick>, pick: TopCityPick) {
  const c = canonicalTopCityPick(pick.city, pick.country);
  const slug = normalizeCityIntentSlug(c.city);
  if (slug.length < 2) return;
  map.set(slug, c);
  const isIndiaBlr =
    c.country.trim().toLowerCase() === "india" && normalizeCityIntentSlug(c.city) === normalizeCityIntentSlug("Bengaluru");
  if (isIndiaBlr) {
    map.set("bangalore", c);
  }
}

export function buildCityIntentSlugLookup(apiRows?: ResidenceCityAggregate[]): Map<string, TopCityPick> {
  const map = new Map<string, TopCityPick>();
  for (const item of LOCATION_LENS_TOP_CITIES_FALLBACK) {
    addPickSlug(map, { city: item.city, country: item.country });
  }
  if (apiRows?.length) {
    for (const row of apiRows) {
      addPickSlug(map, { city: row.city, country: row.country });
    }
  }
  return map;
}

export function cityIntentHrefForPick(pick: TopCityPick): `/intent/location/${string}` {
  return `/intent/location/${normalizeCityIntentSlug(pick.city)}`;
}

export type RoutedToolbarSearch =
  | { kind: "empty" }
  | { kind: "city-hub"; pick: TopCityPick }
  | { kind: "directory"; q: string };

/**
 * Naked keyword fragment (`Pune`, `san-francisco` spacing, or `City, Country`) → catalog pick.
 */
function matchCityPickFromIntentFragment(
  fragment: string,
  options?: { apiRows?: ResidenceCityAggregate[] },
): TopCityPick | null {
  const trimmed = fragment.trim();
  if (!trimmed) return null;

  const lookup = buildCityIntentSlugLookup(options?.apiRows);
  const bySlug = (s: string) => lookup.get(normalizeCityIntentSlug(s)) ?? null;

  const direct = bySlug(trimmed);
  if (direct) return direct;

  const commaHead = trimmed.includes(",") ? trimmed.split(",")[0]?.trim() ?? "" : "";
  if (commaHead && commaHead !== trimmed) {
    return bySlug(commaHead);
  }

  return null;
}

/**
 * Navbar / ⌘K: `@City` locks intent to geographic hub (failed match → plain directory search).
 * Leaving `@` off still treats whole input as optional city shorthand (backward compatible).
 */
export function resolveGlobalToolbarSearchSubmission(
  raw: string,
  options?: { apiRows?: ResidenceCityAggregate[] },
): RoutedToolbarSearch {
  const full = normalizeQ(raw);
  if (!full) return { kind: "empty" };

  if (full.startsWith("@")) {
    const inner = normalizeQ(full.slice(1));
    if (!inner) return { kind: "empty" };
    const pick = pickForExplicitAtCityNavigate(inner, options);
    const segment = normalizeCityIntentSlug(inner);
    if (!segment.length) return { kind: "empty" };
    return { kind: "city-hub", pick };
  }

  const implicit = matchCityPickFromIntentFragment(full, options);
  if (implicit) return { kind: "city-hub", pick: implicit };
  return { kind: "directory", q: full };
}

/**
 * Alumni directory hero & filter drawer — only `@City` escapes to `/intent/location` (avoid hijacking surname matches).
 */
export function tryAtPrefixedCityHubPick(
  raw: string,
  options?: { apiRows?: ResidenceCityAggregate[] },
): TopCityPick | null {
  const full = normalizeQ(raw);
  if (!full.startsWith("@")) return null;
  const inner = normalizeQ(full.slice(1));
  if (!inner) return null;
  const segment = normalizeCityIntentSlug(inner);
  if (!segment.length) return null;
  return pickForExplicitAtCityNavigate(inner, options);
}

/** Narrow helper for callers that resolve a naked city slug (alias of catalog fragment match). */
export function matchToolbarInputToCityPick(
  raw: string,
  options?: { apiRows?: ResidenceCityAggregate[] },
): TopCityPick | null {
  return matchCityPickFromIntentFragment(normalizeQ(raw), options);
}
