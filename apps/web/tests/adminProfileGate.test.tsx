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

function mountApp(role: string, profileFails: boolean) {
  vi.stubEnv("PROD", true);
  window.history.pushState({}, "", "/intent/location/bengaluru");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/v1/me/profile")) return profileFails ? json({ error: "x" }, 500) : json({});
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
    ["super_admin", true],
    ["super_admin", false],
    ["alumni", true],
  ])("%s with failed=%s profile load stops at the error, no navigation", async (role, fails) => {
    mountApp(role, fails);
    await waitFor(() => expect(screen.getByText(/load your profile/)).toBeTruthy());
    expect(document.querySelector("nav")).toBeNull();
    expect(document.querySelector(".nav__user-menu")).toBeNull();
  });
});
