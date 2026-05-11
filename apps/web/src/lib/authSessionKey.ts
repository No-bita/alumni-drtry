/** TanStack cache key for `fetchAuthSession` / `AuthProvider` — isolated so `api/client` can read gate without circular imports. */
export const AUTH_SESSION_QUERY_KEY = ["auth", "session"] as const;
