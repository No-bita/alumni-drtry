import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MetricInfoPill } from "../src/components/MetricInfoPill";

afterEach(cleanup);

describe("MetricInfoPill", () => {
  it("renders a labelled outlined i button, collapsed by default", () => {
    render(<MetricInfoPill label="Accepted notes" text="Counts accepted notes." />);
    const btn = screen.getByRole("button", { name: "About this metric: Accepted notes" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(btn.textContent).toBe("i");
    expect(btn.closest(".aa-info")!.classList.contains("aa-info--pinned")).toBe(false);
  });

  it("click pins the explanation open and a second click closes it", () => {
    render(<MetricInfoPill label="Accepted notes" text="Counts accepted notes." />);
    const btn = screen.getByRole("button", { name: "About this metric: Accepted notes" });
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(btn.closest(".aa-info")!.classList.contains("aa-info--pinned")).toBe(true);
    const bubbleId = btn.getAttribute("aria-describedby");
    expect(bubbleId).toBeTruthy();
    expect(document.getElementById(bubbleId!)!.textContent).toBe("Counts accepted notes.");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("Escape closes a pinned explanation", () => {
    render(<MetricInfoPill label="Accepted notes" text="Counts accepted notes." />);
    const btn = screen.getByRole("button", { name: "About this metric: Accepted notes" });
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(btn, { key: "Escape" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(btn.closest(".aa-info")!.classList.contains("aa-info--pinned")).toBe(false);
  });

  it("pins independently of other pills", () => {
    render(
      <>
        <MetricInfoPill label="One" text="First." />
        <MetricInfoPill label="Two" text="Second." />
      </>,
    );
    const one = screen.getByRole("button", { name: "About this metric: One" });
    const two = screen.getByRole("button", { name: "About this metric: Two" });
    fireEvent.click(one);
    expect(one.getAttribute("aria-expanded")).toBe("true");
    expect(two.getAttribute("aria-expanded")).toBe("false");
  });
});
