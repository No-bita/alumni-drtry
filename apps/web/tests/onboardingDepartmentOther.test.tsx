import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Onboarding } from "../src/pages/Onboarding";

// Members who pick "Other" as their department must specify it in their own words
// before they can move on. The input only exists while "Other" is selected.

const mocks = vi.hoisted(() => ({
  patch: vi.fn<(path: string, body?: unknown) => Promise<object>>(async () => ({})),
  post: vi.fn<(path: string, body?: unknown) => Promise<object>>(async () => ({})),
  get: vi.fn(async () => ({ occupations: [] })),
}));
const profile = {
  id: "p1",
  institutionalEmail: "aarav.mehta@iitbhu.ac.in",
  fullName: "Aarav Mehta",
  departmentCode: null as string | null,
  departmentOtherText: null as string | null,
  degreeCode: "btech",
  batchYear: 2024,
  parsedJoiningYear: 2020,
  onboardingCompletedAt: null,
  mobilePhone: null as string | null,
  openToPreferences: null as unknown,
};
const person = { personId: "p1", role: "alumni" };
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ status: "authenticated", person, myProfile: profile }) }));
vi.mock("../src/api/client", () => ({ api: { patch: mocks.patch, post: mocks.post } }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: mocks.get }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));
vi.mock("../src/lib/betaAnalytics", () => ({ trackBetaUsageEvent: vi.fn() }));
afterEach(() => {
  cleanup();
  profile.departmentCode = null;
  profile.departmentOtherText = null;
  vi.clearAllMocks();
});

async function reachDepartmentQuestion() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <Onboarding />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Start" }));
  fireEvent.click(await screen.findByRole("button", { name: "OK" })); // name pair (prefilled)
  await screen.findByText("Which department, and which degree?");
}

describe("Onboarding department Other specification", () => {
  it("requires the member's own words before advancing from Other", async () => {
    await reachDepartmentQuestion();

    // No specification input until Other is picked.
    expect(screen.queryByPlaceholderText("Please specify")).toBeNull();

    fireEvent.focus(screen.getAllByPlaceholderText("Type or select an option")[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Other" }));

    const specify = await screen.findByPlaceholderText("Please specify");
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    // Empty specification blocks the advance with the required-text error.
    await screen.findByText("Please specify your department.");
    expect(screen.getByText("Which department, and which degree?")).toBeTruthy();

    fireEvent.change(specify, { target: { value: "Applied Mechanics" } });
    fireEvent.click(screen.getByRole("button", { name: "OK" })); // degree is prefilled

    await screen.findByText("Which year did you graduate?");
  });

  it("sends the specification with the profile save", async () => {
    await reachDepartmentQuestion();

    fireEvent.focus(screen.getAllByPlaceholderText("Type or select an option")[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Other" }));
    fireEvent.change(await screen.findByPlaceholderText("Please specify"), {
      target: { value: "Applied Mechanics" },
    });
    fireEvent.click(screen.getByRole("button", { name: "OK" })); // degree is prefilled
    await screen.findByText("Which year did you graduate?");

    // Finish step 1 with the prefilled graduation year.
    fireEvent.click(screen.getByRole("button", { name: /Looks right/ })); // graduation year (prefilled)

    await waitFor(() => {
      const saved = mocks.patch.mock.calls.some(
        ([path, body]) =>
          path === "/v1/me/profile" &&
          (body as { departmentOtherText?: string }).departmentOtherText === "Applied Mechanics",
      );
      expect(saved).toBe(true);
    });
  });
});
