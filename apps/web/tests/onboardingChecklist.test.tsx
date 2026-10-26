import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnboardingChecklistCard } from "../src/components/OnboardingChecklistCard";
import { checklistSteps, doneCount, isNewEnough } from "../src/lib/onboardingChecklist";

const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));

const fresh = new Date(Date.now() - 2 * 86400000).toISOString();
function setAuth(over: Record<string, unknown> = {}, createdAt = fresh) {
  authState.value = {
    status: "authenticated",
    person: { personId: "p1" },
    myProfile: { batchYear: null, residenceCity: null, createdAt, ...over },
  };
}
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter><QueryClientProvider client={qc}><OnboardingChecklistCard /></QueryClientProvider></MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(cleanup);

describe("checklist logic", () => {
  it("steps tick from real data", () => {
    const base = { profile: { batchYear: 2022, residenceCity: "Pune", createdAt: fresh }, hasThreads: false, cityVisited: false };
    expect(doneCount(checklistSteps(base))).toBe(1);
    expect(doneCount(checklistSteps({ ...base, hasThreads: true, cityVisited: true }))).toBe(3);
    expect(checklistSteps({ ...base, profile: { ...base.profile, residenceCity: " " } }).profile).toBe(false);
  });
  it("only new accounts", () => {
    expect(isNewEnough(fresh, Date.now())).toBe(true);
    expect(isNewEnough("2020-01-01T00:00:00Z", Date.now())).toBe(false);
  });
});

describe("OnboardingChecklistCard", () => {
  it("shows only the next undone step as one line", async () => {
    setAuth();
    mount();
    await waitFor(() => expect(screen.getByText(/Next step:/)).toBeTruthy());
    expect(screen.getByText("add your batch and city")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add them" }).getAttribute("href")).toBe("/profiles/p1");
    // Only one step at a time, never the whole list.
    expect(screen.queryByText("join your city board")).toBeNull();
    expect(screen.queryByText("Send your first message")).toBeNull();
  });
  it("is dismissible and stays dismissed", async () => {
    setAuth();
    mount();
    await waitFor(() => screen.getByLabelText("Dismiss the getting started card"));
    fireEvent.click(screen.getByLabelText("Dismiss the getting started card"));
    expect(screen.queryByText(/Next step/)).toBeNull();
    cleanup();
    mount();
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("region", { name: "Getting started" })).toBeNull();
  });
  it("checks off the city step when the board is opened, and the profile step from data", async () => {
    setAuth({ batchYear: 2022, residenceCity: "Pune" });
    mount();
    await waitFor(() => screen.getByText(/One step left:/));
    expect(screen.getByText("join your city board")).toBeTruthy();
    const cta = screen.getByRole("link", { name: "Open city board" });
    expect(cta.getAttribute("href")).toBe("/intent/location/pune");
    fireEvent.click(cta);
    cleanup();
    // Messaging paused: with two steps, both done means the card hides itself.
    mount();
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("region", { name: /getting started/i })).toBeNull();
  });
  it("renders nothing for old accounts and when everything is done", async () => {
    setAuth({}, "2020-01-01T00:00:00Z");
    const { container } = mount();
    await new Promise((r) => setTimeout(r, 30));
    expect(container.textContent).toBe("");
    cleanup();
    setAuth({ batchYear: 2022, residenceCity: "Pune" });
    window.localStorage.setItem("alma.checklist.p1.city", "1");
    const r2 = mount();
    await new Promise((r) => setTimeout(r, 30));
    expect(r2.container.textContent).toBe("");
  });
});
