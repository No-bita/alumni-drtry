import { resolveAppUpstream } from "./appUpstream.ts";

export const TRUSTED_OIDC_HEADER = "x-vercel-trusted-oidc-idp-token";
const PRIVATE_HEADERS = [
  TRUSTED_OIDC_HEADER,
  "x-vercel-oidc-token",
  "x-vercel-protection-bypass",
  "x-vercel-set-bypass-cookie",
];

// Use only for upstream request headers, never as browser response headers.
export function stripDeploymentCredentials(input: Headers): Headers {
  const headers = new Headers(input);
  for (const name of PRIVATE_HEADERS) headers.delete(name);
  for (const name of Array.from(headers.keys())) {
    if (name.startsWith("x-middleware-")) headers.delete(name);
  }
  return headers;
}

export function isReviewedStagingTarget(
  branch: string | undefined,
  environment: string | undefined,
  destination: string,
): boolean {
  if (branch !== "staging" || environment !== "preview") return false;
  try {
    const url = new URL(destination);
    return (
      url.origin === resolveAppUpstream("staging") &&
      url.username === "" && url.password === "" && url.hash === "" &&
      (url.pathname === "/app" || url.pathname.startsWith("/app/") ||
        url.pathname === "/v1" || url.pathname.startsWith("/v1/")) &&
      !url.searchParams.has("x-vercel-protection-bypass") &&
      !url.searchParams.has("x-vercel-set-bypass-cookie")
    );
  } catch {
    return false;
  }
}

export type StagingOidcResult =
  | { type: "unavailable" }
  | { type: "ready"; upstreamHeaders: Headers };

// Token provider is injected: production integration must use the official SDK,
// not an inbound request header. Nothing here reads a token or contacts a service.
// Runtime platform containment must still be validated separately on staging.
export async function prepareStagingOidc(
  branch: string | undefined,
  environment: string | undefined,
  destination: string,
  incomingHeaders: Headers,
  getServerToken: () => Promise<string>,
): Promise<StagingOidcResult> {
  if (!isReviewedStagingTarget(branch, environment, destination)) {
    return { type: "unavailable" };
  }
  try {
    const token = await getServerToken();
    if (!token || /[\r\n]/.test(token)) return { type: "unavailable" };
    const upstreamHeaders = stripDeploymentCredentials(incomingHeaders);
    upstreamHeaders.set(TRUSTED_OIDC_HEADER, token);
    return { type: "ready", upstreamHeaders };
  } catch {
    // Do not log SDK errors: they may contain sensitive request context.
    return { type: "unavailable" };
  }
}
