/** Matches API `GET /v1/search` `q` max length (`discoveryRoutes` zod). */
export const DIRECTORY_KEYWORD_MAX_LENGTH = 120;

/** No background refetch; only refetch when `queryKey` changes (filters / committed keyword). */
export const DIRECTORY_INFINITE_QUERY_OPTIONS = {
  staleTime: Infinity,
  gcTime: 5 * 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchOnReconnect: false,
} as const;

/** Aligns with API aggregate refresh (~24h server cache + Cache-Control). */
export const RESIDENCE_CITIES_QUERY_OPTIONS = {
  staleTime: 24 * 60 * 60 * 1000,
  gcTime: 48 * 60 * 60 * 1000,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchOnReconnect: false,
} as const;

/** Sidebar “Top cities” row count (client slices aggregate list). */
export const RESIDENCE_CITIES_SIDEBAR_LIMIT = 15;

/**
 * Residence-city aggregate fetch size (API max 120).
 * Sidebar “Top cities” aggregate fetch (API max 120).
 */
export const RESIDENCE_CITIES_AGGREGATE_LIMIT = RESIDENCE_CITIES_SIDEBAR_LIMIT;
