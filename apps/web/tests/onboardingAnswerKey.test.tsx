import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Onboarding } from "../src/pages/Onboarding";
import { completePastRoles, pastRolesError } from "../src/lib/answerKey";

const mocks = vi.hoisted(() => ({
  patch: vi.fn<(path: string, body?: unknown) => Promise<object>>(async () => ({})),
  post: vi.fn<(path: string, body?: unknown) => Promise<object>>(async (path) =>
    path === "/v1/orgs/suggest" ? { data: { organization: { id: "00000000-0000-0000-0000-00000000000a" } } } : {},
  ),
  get: vi.fn(async () => ({ occupations: [] })),
}));
const profile = {
  id: "p1",
  institutionalEmail: "asha.rao.cse20@itbhu.ac.in",
  fullName: "Asha Rao",
  departmentCode: "cse",
  degreeCode: "btech",
  batchYear: 2024,
  parsedJoiningYear: 2020,
  onboardingCompletedAt: null,
  mobilePhone: "+91 9876543210",
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
  profile.openToPreferences = null;
  vi.clearAllMocks();
});

// Settled six-question flow: the optional help-with and past-roles screens are gone from
// onboarding (their data stays editable on the profile). This helper drives the new flow
// to the final residence question.
async function reachResidence() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <Onboarding />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Start" }));
  fireEvent.click(await screen.findByRole("button", { name: "OK" })); // name pair (prefilled)
  await screen.findByText("Which department, and which degree?");
  fireEvent.click(screen.getByRole("button", { name: "OK" })); // department + degree (prefilled)
  await screen.findByText("Which year did you graduate?");
  fireEvent.click(screen.getByRole("button", { name: /Looks right/ })); // graduation year (prefilled)
  fireEvent.click(await screen.findByRole("button", { name: "Other" }));
  fireEvent.click(screen.getByRole("button", { name: "OK" }));
  await screen.findByText("Please specify *");
  fireEvent.change(view.container.querySelector("input")!, { target: { value: "Consulting" } });
  fireEvent.click(screen.getByRole("button", { name: "OK" }));
  await screen.findByText(/Where do you live/);
  return view;
}

async function finishFromResidence() {
  fireEvent.change(screen.getByLabelText("Country"), { target: { value: "India" } });
  fireEvent.change(screen.getByLabelText("City"), { target: { value: "Mumbai" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

const profilePatch = () =>
  mocks.patch.mock.calls.find((c) => JSON.stringify(c[1]).includes("markMinimumProfileComplete"))?.[1] as
    | Record<string, unknown>
    | undefined;

describe("onboarding without the optional screens", () => {
  it("never shows the help-with or past-roles screens and finishes after residence", async () => {
    await reachResidence();
    expect(screen.queryByText("What can you help juniors with?")).toBeNull();
    expect(screen.queryByText("Where did you work before?")).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    await finishFromResidence();
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith("/v1/me/profile", { markOnboardingComplete: true }),
    );
  });

  it("finishing sends no open-to preferences and no past-role occupations", async () => {
    await reachResidence();
    await finishFromResidence();
    await waitFor(() => expect(profilePatch()).toBeTruthy());
    expect(profilePatch()!.openToPreferences).toBeUndefined();
    expect(
      mocks.post.mock.calls.filter((c) => c[0] === "/v1/me/occupations" && JSON.stringify(c).includes('"isCurrent":false')),
    ).toHaveLength(0);
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith("/v1/me/profile", { markOnboardingComplete: true }),
    );
  });

  it("leaves previously saved open-to preferences untouched", async () => {
    profile.openToPreferences = { selected: ["coffee"], descriptions: { coffee: "Saved earlier" } };
    await reachResidence();
    await finishFromResidence();
    await waitFor(() => expect(profilePatch()).toBeTruthy());
    for (const call of mocks.patch.mock.calls) {
      expect(JSON.stringify(call[1]).includes("openToPreferences")).toBe(false);
    }
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith("/v1/me/profile", { markOnboardingComplete: true }),
    );
  });
});

describe("past role helpers", () => {
  it("ignores empty rows, dedupes, and flags half-filled rows", () => {
    expect(pastRolesError([{ company: "", role: "" }])).toBeNull();
    expect(pastRolesError([{ company: "X", role: "" }])).not.toBeNull();
    expect(
      completePastRoles([
        { company: " Oracle ", role: "SDE" },
        { company: "oracle", role: "sde" },
        { company: "", role: "" },
      ]),
    ).toEqual([{ company: "Oracle", role: "SDE" }]);
  });
});
