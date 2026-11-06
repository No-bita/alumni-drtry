import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../src/App";
import { takeReturnTo } from "../src/lib/returnTo";

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
HTMLMediaElement.prototype.play = () => Promise.resolve();
HTMLMediaElement.prototype.pause = () => {};

function signedOutAt(path: string) {
  vi.stubEnv("PROD", true);
  window.history.pushState({}, "", path);
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ code: "AUTH_UNAUTHORIZED" }), { status: 401, headers: { "content-type": "application/json" } });
    }),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>,
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  window.localStorage.clear();
});

describe("signed out, under /app", () => {
  it("a member profile sends you to /app/login and remembers the page for after sign-in", async () => {
    const calls = signedOutAt("/app/profiles/p1?tab=x");
    await waitFor(() => expect(window.location.pathname).toBe("/app/login"));
    expect(takeReturnTo()).toBe("/profiles/p1?tab=x");
    // API calls stay at the site root, not under /app.
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((u) => u.startsWith("/v1/"))).toBe(true);
  });

  it("the sign-in page stays put (no redirect loop) and remembers nothing", async () => {
    signedOutAt("/app/login");
    await new Promise((r) => setTimeout(r, 50));
    expect(window.location.pathname).toBe("/app/login");
    expect(takeReturnTo()).toBeNull();
  });
});
