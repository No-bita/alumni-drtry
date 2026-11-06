// Apex routing: which app deployment serves /app and /v1 for each branch.
// Fail closed: any branch not in this map, or a missing branch value,
// resolves to null and the proxy answers 404 without contacting an upstream.
// There is no default upstream and no production fallback for unknown branches.
const APP_UPSTREAMS: Record<string, string> = {
  main: "https://alumni-drtry.vercel.app",
  staging:
    "https://alumni-drt-git-8ee05f-shahaaryanmilanmst20-iitbhuacins-projects.vercel.app",
};

export function resolveAppUpstream(
  branch: string | undefined | null,
  upstreams: Record<string, string> = APP_UPSTREAMS,
): string | null {
  if (typeof branch !== "string" || branch.length === 0) return null;
  // Plain objects inherit Object.prototype members, so a bare index lookup
  // would resolve names like "constructor" or "__proto__" instead of failing
  // closed. Only own properties of the map are valid branches.
  if (!Object.prototype.hasOwnProperty.call(upstreams, branch)) return null;
  const upstream = upstreams[branch];
  return typeof upstream === "string" && upstream.length > 0 ? upstream : null;
}

export function buildUpstreamUrl(
  upstream: string,
  pathname: string,
  search: string,
): string {
  return new URL(pathname + search, upstream).toString();
}

export type AppProxyDecision =
  | { type: "not-found" }
  | { type: "rewrite"; url: string };

// Pure routing decision for one request. Tests inject a synthetic local map
// through `upstreams`, so routing behavior is checked without editing the
// real origin constants or contacting any real origin.
export function decideAppProxy(
  branch: string | undefined | null,
  pathname: string,
  search: string,
  upstreams: Record<string, string> = APP_UPSTREAMS,
): AppProxyDecision {
  const upstream = resolveAppUpstream(branch, upstreams);
  if (!upstream) return { type: "not-found" };
  return { type: "rewrite", url: buildUpstreamUrl(upstream, pathname, search) };
}
