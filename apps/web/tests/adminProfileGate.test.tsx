import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../src/App";

window.matchMedia = ((q: string) => ({
  matches: false,
  media: q,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  onchange: null,
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", NoopObserver);
vi.stubGlobal("ResizeObserver", NoopObserver);
Element.prototype.scrollIntoView = () => {};
window.scrollTo = (() => {}) as typeof window.scrollTo;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

type ProfileMode = "fail" | "missing" | "incomplete";

function mountApp(role: string, mode: ProfileMode, path = "/intent/location/bengaluru") {
  vi.stubEnv("PROD", true);
  window.history.pushState({}, "", path);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/v1/me/profile")) {
        if (mode === "fail") return json({ error: "x" }, 500);
        if (mode === "incomplete") {
          return json({
            profile: { id: "p1", role, onboardingCompletedAt: null, profileCompletedAt: null, appLoginCount: 1 },
          });
        }
        return json({});
      }
      if (u.includes("/v1/me")) return json({ person: { id: "p1", role, email: "a@b.c", fullName: "Test" } });
      return json({});
    }),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("profile gate has no admin bypass", () => {
  it.each([
    ["super_admin", "fail", "/intent/location/bengaluru"],
    ["super_admin", "missing", "/intent/location/bengaluru"],
    ["alumni", "fail", "/intent/location/bengaluru"],
    ["super_admin", "fail", "/profiles/p1"],
    ["alumni", "missing", "/profiles/p1"],
  ] as const)("%s with %s profile on %s stops at the error, no navigation", async (role, mode, path) => {
    mountApp(role, mode, path);
    await waitFor(() => expect(screen.getByText(/load your profile/)).toBeTruthy());
    expect(screen.queryByText("Loading…")).toBeNull();
    expect(document.querySelector("nav")).toBeNull();
    expect(document.querySelector(".nav__user-menu")).toBeNull();
  });

  it("sends a super admin with a valid incomplete profile to onboarding, like alumni", async () => {
    mountApp("super_admin", "incomplete");
    await waitFor(() => expect(window.location.pathname).toBe("/onboarding"));
  });
});
