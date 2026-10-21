import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/api/client";
import { AuthProvider } from "../src/contexts/AuthContext";
import { setAuthSessionExpiredListener } from "../src/lib/authSessionExpiredBridge";
import { activateFixtureDemoSession, deactivateFixtureDemoSession } from "../src/lib/fixtureDemo";

function renderProviderOn(path: string) {
  const client = new QueryClient();
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <div />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
  return client;
}

function NavigationProbe() {
  const navigate = useNavigate();
  return <button onClick={() => navigate("/search")}>go</button>;
}

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
  it.each(["/demo", "/demo/"])(
    "fires no auth request at all when booting directly on %s",
    async (path) => {
      const fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
      vi.stubGlobal("fetch", fetchSpy);
      const client = renderProviderOn(path);
      await new Promise((r) => setTimeout(r, 50));
      expect(fetchSpy).not.toHaveBeenCalled();
      client.clear();
    }
  );

  it("re-enables the session query after navigating away from /demo", async () => {
    const fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchSpy);
    const client = new QueryClient();
    const { getByText } = render(
      <MemoryRouter initialEntries={["/demo"]}>
        <QueryClientProvider client={client}>
          <AuthProvider>
            <NavigationProbe />
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchSpy).not.toHaveBeenCalled();
    fireEvent.click(getByText("go"));
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    client.clear();
  });

  it("still performs the real login check on non-demo routes", async () => {
    const fetchSpy = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchSpy);
    const client = renderProviderOn("/login");
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
