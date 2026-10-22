import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { LocationPage } from "../src/pages/LocationPage";

const authState = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => authState.value }));
vi.mock("../src/components/Nav", () => ({
  Nav: ({ appToolbarLead }: { appToolbarLead?: React.ReactNode }) => <header>{appToolbarLead}</header>,
}));
vi.mock("../src/lib/assertApiGet", () => ({
  assertApiGet: vi.fn(async (path: string) => {
    if (path.startsWith("/v1/directory/residence-cities")) {
      return {
        cities: [
          { city: "Mumbai", country: "India", count: 30 },
          { city: "Bangalore", country: "India", count: 41 },
        ],
      };
    }
    return {};
  }),
}));
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  onchange: null,
  dispatchEvent: () => false,
}));

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

afterEach(cleanup);

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function mount() {
  authState.value = {
    status: "authenticated",
    person: { personId: "p1", institutionalEmail: "test@iitbhu.ac.in", role: "alumni" },
    myProfile: { id: "me-1", fullName: "Test Alum", onboardingCompletedAt: "2026-01-01" },
  };
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/intent/location/bengaluru"]}>
        <Routes>
          <Route path="/intent/location/:citySlug" element={<><LocationPage /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Cities city switcher", () => {
  it("shows the current city as a tappable title and no city strip", () => {
    const { container } = mount();
    expect(screen.getByRole("button", { name: /Bengaluru.*Change city/ })).toBeTruthy();
    expect(container.querySelector(".cities-v2__popular")).toBeNull();
  });

  it("opens a picker, marks the current city, and navigates on pick", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Change city/ }));
    const dialog = screen.getByRole("dialog", { name: "Pick a city" });
    const current = within(dialog).getByRole("button", { name: /Bengaluru/ });
    expect(current.getAttribute("aria-pressed")).toBe("true");
    expect(within(current).getByText("Current")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /Mumbai/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("where").textContent).toBe("/intent/location/mumbai");
  });

  it("closes without changing the city", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Change city/ }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("where").textContent).toBe("/intent/location/bengaluru");
  });
});

describe("Cities picker keyboard", () => {
  it("moves focus into the sheet, closes on Escape and returns focus to the title button", () => {
    mount();
    const trigger = screen.getByRole("button", { name: /Change city/ });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Pick a city" });
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
