import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Profile } from "../src/pages/Profile";

// Edit Profile must actually round-trip the Other-department specification:
// the field saves through /v1/me/profile, empty text is blocked client-side,
// and non-Other profiles never send the field at all.

const h = vi.hoisted(() => {
  const publicProfile = {
    id: "p1",
    institutionalEmail: "aarav.mehta@iitbhu.ac.in",
    role: "alumni",
    fullName: "Aarav Mehta",
    degreeCode: "btech",
    degreeName: "BTech",
    departmentCode: "other",
    departmentName: "Other",
    departmentOtherText: "Applied Mechanics" as string | null,
    batchYear: 2024,
    residenceCountry: "India",
    residenceCity: "Pune",
    bio: null,
    openToPreferences: null,
    profileCompletedAt: "2024-01-01T00:00:00Z",
    onboardingCompletedAt: "2024-01-02T00:00:00Z",
  };
  const refetchAuth = vi.fn(async () => {});
  return {
    apiGet: vi.fn(),
    apiPatch: vi.fn<(path: string, body?: unknown) => Promise<object>>(async () => ({ data: { profile: {} }, error: null })),
    refetchAuth,
    publicProfile,
    authState: {
      value: {
        status: "authenticated",
        person: { personId: "p1", institutionalEmail: "aarav.mehta@iitbhu.ac.in", role: "alumni", isDemo: false },
        myProfile: { ...publicProfile, personalEmail: null, mobilePhone: null },
        myProfileError: false,
        refetch: refetchAuth,
      } as unknown,
    },
  };
});
const { apiGet, apiPatch, publicProfile } = h;

vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => h.authState.value }));
vi.mock("../src/lib/assertApiGet", () => ({ assertApiGet: h.apiGet }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav /> }));
vi.mock("../src/lib/betaAnalytics", () => ({ trackBetaUsageEvent: vi.fn() }));
vi.mock("../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api/client")>()),
  api: { get: vi.fn(async () => ({ data: null, error: null })), post: vi.fn(async () => ({ data: null, error: null })), patch: h.apiPatch, delete: vi.fn(async () => ({ data: null, error: null })) },
}));

afterEach(() => {
  cleanup();
  publicProfile.departmentCode = "other";
  publicProfile.departmentName = "Other";
  publicProfile.departmentOtherText = "Applied Mechanics";
  vi.clearAllMocks();
});

function renderProfile() {
  apiGet.mockImplementation(async (url: string) => {
    if (url.startsWith("/v1/profiles/")) return { profile: publicProfile, occupations: [], links: [] };
    if (url === "/v1/me/links") return { links: [] };
    if (url === "/v1/me/rejected-organizations") return { organizations: [] };
    return {};
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={["/profile/p1"]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/profile/:id" element={<Profile />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function beginEdit() {
  fireEvent.click(await screen.findByRole("button", { name: "Edit profile" }));
}

describe("Edit Profile department Other specification", () => {
  it("saves an edited specification through /v1/me/profile", async () => {
    renderProfile();
    await beginEdit();

    const field = await screen.findByLabelText(/Your department/);
    expect((field as HTMLInputElement).value).toBe("Applied Mechanics");
    fireEvent.change(field, { target: { value: "Ceramic Engineering" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const call = apiPatch.mock.calls.find(([path]) => path === "/v1/me/profile");
      expect(call).toBeTruthy();
      expect((call![1] as Record<string, unknown>).departmentOtherText).toBe("Ceramic Engineering");
    });
  });

  it("blocks saving an empty specification before any request", async () => {
    renderProfile();
    await beginEdit();

    const field = await screen.findByLabelText(/Your department/);
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("Please specify your department.");
    expect(apiPatch.mock.calls.some(([path]) => path === "/v1/me/profile")).toBe(false);
  });

  it("never sends the field for a non-Other department", async () => {
    publicProfile.departmentCode = "cse";
    publicProfile.departmentName = "Computer Science and Engineering";
    publicProfile.departmentOtherText = null;
    renderProfile();
    await beginEdit();

    expect(screen.queryByLabelText(/Your department/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const call = apiPatch.mock.calls.find(([path]) => path === "/v1/me/profile");
      expect(call).toBeTruthy();
      expect((call![1] as Record<string, unknown>).departmentOtherText).toBeUndefined();
    });
  });
});
