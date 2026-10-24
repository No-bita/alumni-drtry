import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Paper-plane coverage (user call, 24 Oct 2026): "Build the plane screen for
 * all loading screens." Every full-screen loading state renders FoldToFlight,
 * not the legacy plain "Loading…" text. This guard fails if a full-screen
 * plain loader silently comes back without deliberately updating this test.
 *
 * Deliberately out of scope (not full-screen screens):
 * - Search results spinner (inline, page chrome stays visible)
 * - BulletinPanel archived-replies inline status text
 * - AdminPlaceDetail admin-only inline title state
 * - Landing.tsx / ConnectionThread.tsx (unrouted: no route mounts them)
 */

function sourceWithoutComments(rel: string): string {
  const raw = readFileSync(path.join(process.cwd(), "src", rel), "utf8");
  return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)[^\S\n]*\/\/[^\n]*/g, "$1");
}

describe("paper-plane loading screens guard", () => {
  it("covers the app-level fallback and every profile-gate loader", () => {
    const app = sourceWithoutComments("App.tsx");
    expect(app).toMatch(/function RouteFallback\(\) \{\s*return <FoldToFlight ready=\{false\} \/>;/);
    expect(app).not.toContain("Loading…");
    // Three gate loaders (ProfileGate, OwnProfileRequiresOnboardingComplete, OwnProfileRedirect)
    // plus the fallback all render the plane.
    expect(app.match(/<FoldToFlight ready=\{false\} \/>/g)?.length).toBe(4);
  });

  it("covers the onboarding eligibility gate", () => {
    const onboarding = sourceWithoutComments("pages/Onboarding.tsx");
    expect(onboarding).not.toContain("Loading…");
    expect(onboarding).toMatch(/gate === "loading"[\s\S]*?<FoldToFlight ready=\{false\} \/>/);
  });

  it("covers the magic-link sign-in wait", () => {
    const verify = sourceWithoutComments("pages/AuthVerify.tsx");
    expect(verify).toContain("<FoldToFlight ready={false} />");
  });

  it("keeps the plane as the only full-screen loader across routed pages", () => {
    // Pages that may render full-screen loading states; inline loaders and
    // unrouted files listed above are intentionally excluded.
    for (const rel of ["pages/Onboarding.tsx", "pages/AuthVerify.tsx"]) {
      expect(sourceWithoutComments(rel), rel).not.toContain("Loading…");
    }
  });
});
