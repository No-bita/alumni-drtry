/**
 * Central TanStack Query keys for deduped fetches and targeted invalidation.
 * Use `invalidateQueries({ queryKey: queryKeys.foo.all })` to bust a subtree.
 */
export const queryKeys = {
  notifications: {
    all: ["notifications"] as const,
    list: () => ["notifications", "list"] as const,
    summary: () => ["notifications", "summary"] as const,
  },
  contactRequests: {
    all: ["contact-requests"] as const,
    inbox: () => ["contact-requests", "inbox"] as const,
  },
  connectionThreads: {
    all: ["connection-threads"] as const,
    list: () => ["connection-threads", "list"] as const,
    detail: (id: string) => ["connection-threads", "detail", id] as const,
  },
  me: {
    all: ["me"] as const,
    occupations: () => ["me", "occupations"] as const,
    links: () => ["me", "links"] as const,
  },
  profiles: {
    all: ["profiles"] as const,
    detail: (id: string) => ["profiles", "detail", id] as const,
  },
  home: {
    batchSnapshot: (personId: string, batchYear: number, dept: string) =>
      ["home", "batch-snapshot", personId, batchYear, dept] as const,
  },
  auth: {
    all: ["auth"] as const,
    googleConfig: () => ["auth", "google-config"] as const,
    magicLinkVerify: (challengeId: string, magicLinkToken: string) =>
      ["auth", "verify", challengeId, magicLinkToken] as const,
  },
  directory: {
    all: ["directory"] as const,
    searchInfinite: (
      batch: number | null,
      dept: string,
      company: string,
      occ: string,
      residenceCountry: string,
      residenceCity: string,
      q: string
    ) =>
      [
        "directory",
        "search",
        "infinite",
        batch ?? "",
        dept,
        company,
        occ,
        residenceCountry,
        residenceCity,
        q,
      ] as const,
    residenceCities: (limit: number) => ["directory", "residence-cities", limit] as const,
  },
  intentcasts: {
    all: ["intentcasts"] as const,
    /** Prefix for all bulletin feed queries (public + mine); use with `invalidateQueries`. */
    feedQueries: () => ["intentcasts", "feed"] as const,
    feedInfinite: (p: {
      category: string | null;
      mine: boolean;
      authorHistory: boolean;
      excludeAuthorSoftDeleted: boolean;
      retryNonce: number;
    }) =>
      [
        "intentcasts",
        "feed",
        "infinite",
        p.category ?? "",
        p.mine,
        p.authorHistory,
        p.excludeAuthorSoftDeleted,
        p.retryNonce,
      ] as const,
    detail: (id: string) => ["intentcasts", "detail", id] as const,
    responses: (intentcastId: string) => ["intentcasts", "responses", intentcastId] as const,
  },
} as const;
