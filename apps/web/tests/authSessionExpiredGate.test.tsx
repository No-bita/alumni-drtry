// Regression coverage for the staging sign-in failure (2026-10-30): the session-expired
// bridge must not fire for anonymous visitors. An anonymous page load 401s on the session
// bootstrap; firing the bridge there aborts an in-flight sign-in link verification and
// bounces the visitor to /login?reason=session_expired.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../src/contexts/AuthContext";
import { AuthSessionExpiredRegistrar } from "../src/components/AuthSessionExpiredRegistrar";
import { AuthVerify } from "../src/pages/AuthVerify";
import { api } from "../src/api/client";

vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));

const state = vi.hoisted(() => ({
  verifyCompleted: false,
  meReturns200: false,
}));

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function installFetchStub() {
  state.verifyCompleted = false;
  state.meReturns200 = false;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/v1/auth/verify")) {
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => {
          state.verifyCompleted = true;
          state.meReturns200 = true;
          resolve(jsonResponse(200, { person: { role: "alumni", isDemo: false }, sessionExpiresAt: new Date(Date.now() + 86400e3).toISOString() }));
        }, 150);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    }
    if (url.includes("/v1/auth/logout")) {
      return Promise.resolve(jsonResponse(204, {}));
    }
    if (url.includes("/v1/me")) {
      if (state.meReturns200) {
        return Promise.resolve(jsonResponse(200, url.includes("/v1/me/profile") ? { profile: null } : { person: { role: "alumni", isDemo: false } }));
      }
      return new Promise<Response>((resolve) => setTimeout(() => resolve(jsonResponse(401, { code: "AUTH_UNAUTHORIZED", message: "Authentication required." })), 5));
    }
    return Promise.resolve(jsonResponse(404, { code: "NOT_FOUND", message: "nope" }));
  });
}

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

function Probe() {
  return <button data-testid="probe" onClick={() => void api.get("/v1/me")}>probe</button>;
}

function mountApp(initialEntry: string, verifyRoute = false) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AuthProvider>
          <AuthSessionExpiredRegistrar />
          <Routes>
            {verifyRoute ? <Route path="/auth/verify" element={<AuthVerify />} /> : null}
            <Route path="*" element={<><Probe /><Where /></>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("session-expired bridge gating", () => {
  it("does not bounce an anonymous visitor mid sign-in link verification", async () => {
    installFetchStub();
    mountApp("/auth/verify?challengeId=c1&magicLinkToken=t1", true);
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/home"), { timeout: 4000 });
    expect(state.verifyCompleted).toBe(true);
  }, 10000);

  it("still bounces a signed-in visitor whose session is rejected", async () => {
    installFetchStub();
    state.meReturns200 = true; // signed-in session at bootstrap
    mountApp("/home");
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/home"), { timeout: 4000 });
    state.meReturns200 = false; // session now rejected by the server
    fireEvent.click(screen.getByTestId("probe"));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/login?reason=session_expired"), { timeout: 4000 });
  }, 10000);
});
