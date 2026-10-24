import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthVerify } from "../src/pages/AuthVerify";

const refetch = vi.hoisted(() => vi.fn());
const apiGet = vi.hoisted(() => vi.fn());
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ refetch }) }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));
vi.mock("../src/api/client", async (orig) => ({ ...(await orig<Record<string, unknown>>()), api: { get: apiGet } }));

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}
function mount(search: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[`/auth/verify${search}`]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/auth/verify" element={<AuthVerify />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
const person = { role: "alumni" };

beforeEach(() => {
  apiGet.mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AuthVerify", () => {
  it("shows the invalid-link state without calling the API when params are missing", () => {
    mount("");
    expect(screen.getByText("Link invalid or expired")).toBeTruthy();
    expect(apiGet).not.toHaveBeenCalled();
    mount("?challengeId=c1");
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("verifies with encoded params and shows the paper-plane loading screen", async () => {
    refetch.mockReturnValue(new Promise(() => {}));
    mount("?challengeId=c%201&magicLinkToken=t%2Fk");
    expect(screen.getByRole("main", { name: "Opening Alma" })).toBeTruthy();
    expect(screen.getByText("Start with a fold.")).toBeTruthy();
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(apiGet.mock.calls[0]![0]).toBe("/v1/auth/verify?challengeId=c%201&magicLinkToken=t%2Fk");
  });

  it("shows the invalid-link state when the API says no", async () => {
    apiGet.mockResolvedValue({ error: { code: "BAD", message: "expired" } });
    mount("?challengeId=c1&magicLinkToken=t1");
    await screen.findByText("Link invalid or expired");
    expect(refetch).not.toHaveBeenCalled();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/login");
  });

  it("shows the invalid-link state when the session cannot be loaded afterwards", async () => {
    refetch.mockResolvedValue(null);
    mount("?challengeId=c1&magicLinkToken=t1");
    await screen.findByText("Link invalid or expired");
  });

  it("sends new users to onboarding", async () => {
    refetch.mockResolvedValue({ person, profile: { onboardingCompletedAt: null, appLoginCount: 1, role: "alumni" } });
    mount("?challengeId=c1&magicLinkToken=t1");
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/onboarding"));
  });

  it("sends finished users, returning incomplete users and profile-less users home", async () => {
    for (const profile of [
      { onboardingCompletedAt: "2026-01-01", appLoginCount: 1, role: "alumni" },
      { onboardingCompletedAt: null, appLoginCount: 9, role: "alumni" },
      null,
    ]) {
      refetch.mockResolvedValue({ person, profile });
      mount("?challengeId=c1&magicLinkToken=t1");
      await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/home"));
      cleanup();
    }
  });
});
