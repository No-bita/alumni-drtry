import { getVercelOidcToken } from "@vercel/oidc";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decideAppProxy } from "./lib/appUpstream.ts";
import { prepareStagingOidc, stripDeploymentCredentials } from "./lib/stagingOidc.ts";

// Only the reviewed staging branch in Vercel's preview environment obtains
// identity credentials. Unknown branches and failed identity reads fail closed.
export async function proxy(request: NextRequest) {
  const branch = process.env.VERCEL_GIT_COMMIT_REF;
  const decision = decideAppProxy(branch, request.nextUrl.pathname, request.nextUrl.search);
  if (decision.type === "not-found") {
    return new NextResponse(null, { status: 404 });
  }
  let upstreamHeaders = stripDeploymentCredentials(request.headers);
  if (branch === "staging") {
    const identity = await prepareStagingOidc(
      branch, process.env.VERCEL_ENV, decision.url, request.headers,
      () => getVercelOidcToken(),
    );
    if (identity.type !== "ready") {
      return new NextResponse(null, {
        status: 503, headers: { "Cache-Control": "no-store" },
      });
    }
    upstreamHeaders = identity.upstreamHeaders;
  }
  // Request overrides, not browser response headers. Always let Next generate
  // and register internal override metadata; never assemble it ourselves.
  return NextResponse.rewrite(decision.url, { request: { headers: upstreamHeaders } });
}

export const config = {
  matcher: ["/app/:path*", "/v1/:path*"],
};
