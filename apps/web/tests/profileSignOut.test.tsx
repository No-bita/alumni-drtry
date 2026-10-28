import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { Profile } from "../src/pages/Profile";

const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));
vi.mock("../src/lib/assertApiGet", () => ({
  assertApiGet: vi.fn(async (path: string) => {
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
      };
    }
    return {};
  }),
}));

afterEach(cleanup);

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function mount(path: string, logout = vi.fn(async () => {}), logoutAll = vi.fn(async () => {}), isDemo = false) {
  authState.value = {
    status: "authenticated",
    person: { personId: "p1", institutionalEmail: "test@iitbhu.ac.in", role: "alumni", isDemo },
    myProfile: { id: "me-1", fullName: "Test Alum", onboardingCompletedAt: "2026-01-01" },
    refetch: vi.fn(),
    logout,
    logoutAll,
  };
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/profiles/:id" element={<Profile />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return logout;
}

describe("Profile sign out", () => {
  it("sign out of all devices asks once, then signs out everywhere to the landing page", async () => {
    const logoutAll = vi.fn(async () => {});
    mount("/profiles/me-1", vi.fn(async () => {}), logoutAll);
    fireEvent.click(await screen.findByRole("button", { name: "Sign out of all devices" }));
    expect(screen.getByText(/every phone and computer, including this one/)).toBeTruthy();
    expect(logoutAll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, sign out everywhere" }));
    await waitFor(() => expect(logoutAll).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/"));
  });

  it("sign out of all devices: cancel does nothing; a failure is shown and you stay signed in", async () => {
    const logoutAll = vi.fn(async () => {
      throw new Error("Couldn't sign out of all devices. Try again.");
    });
    mount("/profiles/me-1", vi.fn(async () => {}), logoutAll);
    fireEvent.click(await screen.findByRole("button", { name: "Sign out of all devices" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Sign out of all devices" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign out of all devices" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, sign out everywhere" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Try again");
    expect(screen.queryByTestId("where")).toBeNull();
  });

  it("the shared demo account has no 'all devices' option (it would sign out other viewers)", async () => {
    mount("/profiles/me-1", vi.fn(async () => {}), vi.fn(async () => {}), true);
    await screen.findByRole("button", { name: "Sign out" });
    expect(screen.queryByRole("button", { name: "Sign out of all devices" })).toBeNull();
  });

  it("shows Sign out on the member's own profile and signs out to the landing page", async () => {
    const logout = mount("/profiles/me-1");
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/"));
  });

  it("has only one owner Sign out, hides it in Preview and restores it on Back", async () => {
    mount("/profiles/me-1");
    await screen.findByRole("button", { name: "Sign out" });
    expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Preview", exact: true }));
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back", exact: true }));
    expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(1);
  });

  it("does not show Sign out on someone else's profile", async () => {
    mount("/profiles/other-2");
    await screen.findByText("Test Alum");
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });
});
