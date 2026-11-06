import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decideAppProxy } from "./lib/appUpstream.ts";

// Apex routing: forward app and API paths to the matching app deployment.
// Fail closed: unknown or missing branches forward nowhere.
export function proxy(request: NextRequest) {
  const decision = decideAppProxy(
    process.env.VERCEL_GIT_COMMIT_REF,
    request.nextUrl.pathname,
    request.nextUrl.search,
  );
  if (decision.type === "not-found") {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.rewrite(decision.url);
}

export const config = {
  matcher: ["/app/:path*", "/v1/:path*"],
};
