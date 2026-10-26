import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({ patch: vi.fn<(path: string, body?: unknown) => Promise<object>>(async () => ({})) }));
const state = vi.hoisted(() => ({
  profile: { profileCompletedAt: "2026-01-01T00:00:00Z", openToPreferences: null as unknown },
}));
vi.mock("../src/api/client", () => ({ api: { patch: mocks.patch } }));
vi.mock("../src/contexts/AuthContext", () => ({
  useAuth: () => ({ status: "authenticated", person: { personId: "p-card" }, myProfile: state.profile }),
}));

import { HomeAnswerKeyCard } from "../src/components/HomeAnswerKeyCard";

function mount() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <HomeAnswerKeyCard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  state.profile = { profileCompletedAt: "2026-01-01T00:00:00Z", openToPreferences: null };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HomeAnswerKeyCard", () => {
  it("lets a member without tags pick and save their answer key", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Choose what you’ll help with" }));
    fireEvent.click(screen.getByRole("button", { name: /Higher-studies advice/ }));
    fireEvent.click(screen.getByRole("button", { name: /Mentorship/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save (2/5)" }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith("/v1/me/profile", {
        openToPreferences: {
          selected: ["study_advice", "mentorship"],
          descriptions: {
            study_advice: "Happy to advise on MS, MBA or PhD plans",
            mentorship: "Happy to mentor and guide",
          },
        },
      }),
    );
    expect(await screen.findByText("Answer key saved.")).toBeTruthy();
  });

  it("stays hidden for members who already have tags or haven't finished their profile", () => {
    state.profile = { profileCompletedAt: "2026-01-01T00:00:00Z", openToPreferences: { selected: ["coffee"], descriptions: {} } };
    const a = mount();
    expect(a.container.textContent).toBe("");
    cleanup();
    state.profile = { profileCompletedAt: null as unknown as string, openToPreferences: null };
    const b = mount();
    expect(b.container.textContent).toBe("");
  });

  it("'Not now' hides it and remembers on this device", () => {
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(view.container.textContent).toBe("");
    cleanup();
    expect(mount().container.textContent).toBe("");
  });
});
