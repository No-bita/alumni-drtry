import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { OnboardingProgress } from "../src/components/onboarding/OnboardingProgress";

afterEach(cleanup);

describe("OnboardingProgress", () => {
  it("shows a continuous step x of N label", () => {
    render(<OnboardingProgress current={7} total={11} />);
    expect(screen.getByText("Step 7 of 11")).toBeTruthy();
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("7");
    expect(bar.getAttribute("aria-valuemax")).toBe("11");
  });

  it("keeps counting past the first section instead of resetting", () => {
    // 6 questions in section one, so the first occupation question is step 7.
    render(<OnboardingProgress current={6 + 1} total={6 + 5} />);
    expect(screen.getByText("Step 7 of 11")).toBeTruthy();
  });

  it("clamps out-of-range values", () => {
    render(<OnboardingProgress current={99} total={5} />);
    expect(screen.getByText("Step 5 of 5")).toBeTruthy();
  });
});
