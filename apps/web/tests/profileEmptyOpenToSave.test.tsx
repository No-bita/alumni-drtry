import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const patch = vi.hoisted(() => vi.fn<(path: string, body?: unknown) => Promise<object>>(async () => ({})));
vi.mock("../src/api/client", async (orig) => {
  const actual = await orig<typeof import("../src/api/client")>();
  return { ...actual, api: { ...actual.api, patch, post: vi.fn(async () => ({})), delete: vi.fn(async () => ({})) } };
});
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({
    status: "authenticated",
    person: { role: "alumni", institutionalEmail: "sample@itbhu.ac.in" },
    myProfile: { id: "p1", personalEmail: null, mobilePhone: null, onboardingCompletedAt: "2026-01-01" },
    refetch: vi.fn(),
    logout: vi.fn(),
  }),
}));
vi.mock("../src/components/Nav", () => ({ Nav: () => null }));
vi.mock("../src/lib/assertApiGet", () => ({
  assertApiGet: vi.fn((path: string) =>
    path.startsWith("/v1/profiles/")
      ? Promise.resolve({
          profile: { id: "p1", fullName: "Sample Alum", departmentCode: "cse", batchYear: 2020, residenceCity: "Pune", residenceCountry: "India", openToPreferences: null },
          occupations: [],
          links: [],
        })
      : Promise.resolve({ links: [], occupations: [] }),
  ),
}));

import { Profile } from "../src/pages/Profile";

afterEach(cleanup);

it("saving a profile with no Open-to tags sends null (clear) instead of an empty selection", async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/profiles/p1?edit=contact"]}>
        <Routes>
          <Route path="/profiles/:id" element={<Profile />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Save", exact: true }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith("/v1/me/profile", expect.objectContaining({ residenceCity: "Pune" })));
  const body = patch.mock.calls.find((c) => c[0] === "/v1/me/profile")![1] as Record<string, unknown>;
  expect(body.openToPreferences).toBeNull();
});
