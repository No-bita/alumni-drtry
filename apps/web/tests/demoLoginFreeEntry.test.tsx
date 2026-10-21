import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/api/client";
import { AuthProvider } from "../src/contexts/AuthContext";
import { setAuthSessionExpiredListener } from "../src/lib/authSessionExpiredBridge";
import { activateFixtureDemoSession, deactivateFixtureDemoSession } from "../src/lib/fixtureDemo";

const unauthorized = () =>
  new Response(JSON.stringify({ code: "AUTH_UNAUTHORIZED", message: "nope" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  deactivateFixtureDemoSession();
  setAuthSessionExpiredListener(null);
  cleanup();
  vi.unstubAllGlobals();
});

describe("sample demo entry is login-free", () => {
  it("fires no auth request at all when booting directly on /demo", async () => {
    window.history.pushState({}, "", "/demo");
    const fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchSpy);
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <div />
        </AuthProvider>
      </QueryClientProvider>
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchSpy).not.toHaveBeenCalled();
    client.clear();
  });

  it("still performs the real login check on non-demo routes", async () => {
    window.history.pushState({}, "", "/login");
    const fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchSpy);
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <div />
        </AuthProvider>
      </QueryClientProvider>
    );
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    client.clear();
  });

  it("suppresses the session-expiry bounce when a pre-activation request 401s after activation", async () => {
    let respond!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { respond = r; })));
    const onExpired = vi.fn();
    setAuthSessionExpiredListener(onExpired);
    // Request starts before demo activation, so it goes to the real network...
    const pending = api.get("/v1/me");
    // ...but the response lands after the tab entered the sample session.
    activateFixtureDemoSession();
    respond(unauthorized());
    await pending;
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("keeps the real expiry bounce outside the demo", async () => {
    let respond!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { respond = r; })));
    const onExpired = vi.fn();
    setAuthSessionExpiredListener(onExpired);
    const pending = api.get("/v1/me");
    respond(unauthorized());
    await pending;
    expect(onExpired).toHaveBeenCalledTimes(1);
  });
});
