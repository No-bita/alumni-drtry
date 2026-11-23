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
