import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Profile } from "../src/pages/Profile";

const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));
vi.mock("../src/lib/assertApiGet", () => ({
  assertApiGet: vi.fn(async (path: string) => {
    if (path === "/v1/me/rejected-organizations") {
      return { organizations: [{ id: "org-1", name: "Acme Dynacorp", rejectionReason: "Can't verify this company" }] };
    }
    if (path.startsWith("/v1/profiles/")) {
      const id = path.split("/")[3];
      return {
        profile: {
          id,
          fullName: "Test Alum",
          departmentCode: "CSE",
          departmentName: "Computer Science",
          parsedDepartmentCode: "CSE",
          parsedDepartmentName: "Computer Science",
          batchYear: 2022,
          parsedJoiningYear: 2018,
          bio: null,
          residenceCity: "Bengaluru",
          residenceCountry: "India",
          onboardingCompletedAt: "2026-01-01",
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
          role: "alumni",
          links: [],
          experiences: [],
        },
        occupations: [],
        links: [],
      };
    }
    return {};
  }),
}));

afterEach(cleanup);

function mount(profileId: string) {
  authState.value = {
    status: "authenticated",
    person: { personId: "me-1", institutionalEmail: "test@iitbhu.ac.in", role: "alumni", isDemo: false },
    myProfile: { id: "me-1", fullName: "Test Alum", onboardingCompletedAt: "2026-01-01" },
    refetch: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
  };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[`/profiles/${profileId}`]}>
        <Routes>
          <Route path="/profiles/:id" element={<Profile />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Profile rejected-company flag", () => {
  it("own profile shows the flag with the reason and an update action", async () => {
    mount("me-1");
    expect(await screen.findByText("Company needs updating")).toBeTruthy();
    expect(screen.getByText(/‘Acme Dynacorp’ wasn’t accepted as a company/).textContent).toContain(
      "Reason: Can't verify this company.",
    );
    expect(screen.getByRole("button", { name: "Update company" })).toBeTruthy();
  });

  it("never shows on someone else's profile", async () => {
    mount("other-1");
    await screen.findByText("Test Alum");
    expect(screen.queryByText("Company needs updating")).toBeNull();
  });
});
