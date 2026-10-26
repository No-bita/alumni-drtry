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

async function reachAnswerKey() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <Onboarding />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Start" }));
  for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole("button", { name: "OK" }));
  fireEvent.click(screen.getByRole("button", { name: /Looks right/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Other" }));
  fireEvent.click(screen.getByRole("button", { name: "OK" }));
  await screen.findByText("Please specify *");
  fireEvent.change(view.container.querySelector("input")!, { target: { value: "Consulting" } });
  fireEvent.click(screen.getByRole("button", { name: "OK" }));
  fireEvent.change(view.container.querySelector("input")!, { target: { value: "India" } });
  fireEvent.click(screen.getByRole("button", { name: "OK" }));
  fireEvent.change(view.container.querySelector("input")!, { target: { value: "Mumbai" } });
  fireEvent.click(screen.getByRole("button", { name: "OK" }));
  fireEvent.click(screen.getByRole("button", { name: "OK" })); // phone (prefilled)
  await screen.findByText("What can you help juniors with?");
  return view;
}

const profilePatch = () =>
  mocks.patch.mock.calls.find((c) => JSON.stringify(c[1]).includes("markMinimumProfileComplete"))?.[1] as
    | Record<string, unknown>
    | undefined;

describe("onboarding answer key + past roles", () => {
  it("saves picked tags and complete past roles, then finishes", async () => {
    await reachAnswerKey();
    fireEvent.click(screen.getByRole("button", { name: /Referrals/ }));
    fireEvent.click(screen.getByRole("button", { name: /Settling into my city/ }));
    expect(screen.getByText("2/5 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    await screen.findByText("Where did you work before?");
    fireEvent.change(screen.getByLabelText("Previous role 1: company"), { target: { value: "Oracle" } });
    fireEvent.change(screen.getByLabelText("Previous role 1: role"), { target: { value: "Software Engineer" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(profilePatch()).toBeTruthy());
    expect(mocks.post).toHaveBeenCalledWith("/v1/me/occupations", {
      occupationTypeCode: "full_time_employment",
      organizationId: "00000000-0000-0000-0000-00000000000a",
      roleTitle: "Software Engineer",
      isCurrent: false,
    });
    expect(profilePatch()!.openToPreferences).toEqual({
      selected: ["referrals", "city_help"],
      descriptions: {
        referrals: "Happy to refer for relevant roles",
        city_help: "Happy to help newcomers settle into my city",
      },
    });
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith("/v1/me/profile", { markOnboardingComplete: true }),
    );
  });

  it("skipping both steps completes onboarding without sending tags or past roles", async () => {
    profile.openToPreferences = { selected: ["coffee"], descriptions: { coffee: "Saved earlier" } };
    await reachAnswerKey();
    fireEvent.click(screen.getByRole("button", { name: /Referrals/ }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await screen.findByText("Where did you work before?");
    fireEvent.change(screen.getByLabelText("Previous role 1: company"), { target: { value: "Oracle" } });
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await waitFor(() => expect(profilePatch()).toBeTruthy());
    expect(profilePatch()!.openToPreferences).toBeUndefined();
    expect(mocks.post.mock.calls.filter((c) => c[0] === "/v1/me/occupations" && JSON.stringify(c).includes('"isCurrent":false'))).toHaveLength(0);
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith("/v1/me/profile", { markOnboardingComplete: true }),
    );
  });

  it("preselects saved tags when resuming and caps at five", async () => {
    profile.openToPreferences = { selected: ["coffee"], descriptions: { coffee: "Saved earlier" } };
    await reachAnswerKey();
    expect(screen.getByRole("button", { name: /Coffee chats/ }).getAttribute("aria-pressed")).toBe("true");
    for (const name of [/Referrals/, /Mentorship/, /Settling into my city/, /Higher-studies advice/]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }
    expect(screen.getByText("5/5 selected")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Speaking/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("blocks a half-filled past role", async () => {
    await reachAnswerKey();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    await screen.findByText("Where did you work before?");
    fireEvent.change(screen.getByLabelText("Previous role 2: role"), { target: { value: "Analyst" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Add both the company and the role, or leave the row empty.")).toBeTruthy();
    expect(profilePatch()).toBeUndefined();
  });
});

describe("onboarding answer key — review regressions", () => {
  it("after Skip and Back, what's shown is what will be saved", async () => {
    await reachAnswerKey();
    fireEvent.click(screen.getByRole("button", { name: /Referrals/ }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await screen.findByText("Where did you work before?");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText("What can you help juniors with?");
    expect(screen.getByRole("button", { name: /Referrals/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("0/5 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Mentorship/ }));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await waitFor(() => expect(profilePatch()).toBeTruthy());
    expect((profilePatch()!.openToPreferences as { selected: string[] }).selected).toEqual(["mentorship"]);
  });

  it("Enter on a focused tag selects it instead of advancing", async () => {
    await reachAnswerKey();
    const referrals = screen.getByRole("button", { name: /Referrals/ });
    referrals.focus();
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.click(referrals); // the browser's native Enter→click on a focused button
    expect(screen.getByText("What can you help juniors with?")).toBeTruthy();
    expect(referrals.getAttribute("aria-pressed")).toBe("true");
  });

  it("does not recreate a past role that's already on the profile", async () => {
    mocks.get.mockResolvedValue({
      occupations: [{ id: "o1", occupationTypeCode: "full_time_employment", roleTitle: "Software Engineer", isCurrent: false, organizationName: "Oracle" }],
    } as never);
    await reachAnswerKey();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    await screen.findByText("Where did you work before?");
    fireEvent.change(screen.getByLabelText("Previous role 1: company"), { target: { value: "oracle" } });
    fireEvent.change(screen.getByLabelText("Previous role 1: role"), { target: { value: "software engineer" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(profilePatch()).toBeTruthy());
    expect(mocks.post.mock.calls.filter((c) => c[0] === "/v1/me/occupations" && JSON.stringify(c).includes('"isCurrent":false'))).toHaveLength(0);
    mocks.get.mockResolvedValue({ occupations: [] } as never);
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
