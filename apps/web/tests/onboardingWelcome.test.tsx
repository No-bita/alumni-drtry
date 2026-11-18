import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OnboardingWelcome } from "../src/components/onboarding/OnboardingWelcome";

vi.mock("../src/contexts/AuthContext", () => ({ useAuth: () => ({ logout: () => Promise.resolve() }) }));
vi.mock("../src/components/Nav", () => ({ Nav: () => <nav data-testid="nav" /> }));

afterEach(cleanup);

function mount(showBeginButton: boolean) {
  return render(
    <MemoryRouter>
      <OnboardingWelcome onBegin={() => {}} showBeginButton={showBeginButton}>
        <p>question body</p>
      </OnboardingWelcome>
    </MemoryRouter>,
  );
}

describe("OnboardingWelcome layout", () => {
  it("renders the value column next to the headline on the welcome step", () => {
    const { container } = mount(true);
    expect(container.querySelector(".onboarding-welcome__left")).not.toBeNull();
    expect(container.querySelector(".onboarding-welcome--intro")).not.toBeNull();
    expect(screen.getByText("Welcome to Alma Mater")).toBeTruthy();
  });

  it("keeps the question steps single column", () => {
    const { container } = mount(false);
    expect(container.querySelector(".onboarding-welcome__left")).toBeNull();
    expect(container.querySelector(".onboarding-welcome--questions")).not.toBeNull();
  });

  it("paints the document dark while mounted and restores it on unmount", () => {
    const { unmount } = mount(true);
    expect(document.body.classList.contains("onboarding-dark")).toBe(true);
    expect(document.documentElement.classList.contains("onboarding-dark")).toBe(true);
    unmount();
    expect(document.body.classList.contains("onboarding-dark")).toBe(false);
    expect(document.documentElement.classList.contains("onboarding-dark")).toBe(false);
  });
});

describe("OnboardingWelcome auto-advance", () => {
  it("advances by itself after 3 seconds on the welcome step", () => {
    vi.useFakeTimers();
    try {
      const onBegin = vi.fn();
      render(
        <MemoryRouter>
          <OnboardingWelcome onBegin={onBegin} showBeginButton />
        </MemoryRouter>,
      );
      expect(onBegin).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2999);
      expect(onBegin).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(onBegin).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the manual Start path and fires only once when tapped first", () => {
    vi.useFakeTimers();
    try {
      const onBegin = vi.fn();
      render(
        <MemoryRouter>
          <OnboardingWelcome onBegin={onBegin} showBeginButton />
        </MemoryRouter>,
      );
      screen.getByRole("button", { name: "Start" }).click();
      expect(onBegin).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not auto-advance on the question steps", () => {
    vi.useFakeTimers();
    try {
      const onBegin = vi.fn();
      render(
        <MemoryRouter>
          <OnboardingWelcome onBegin={onBegin} showBeginButton={false}>
            <p>question body</p>
          </OnboardingWelcome>
        </MemoryRouter>,
      );
      vi.advanceTimersByTime(5000);
      expect(onBegin).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
