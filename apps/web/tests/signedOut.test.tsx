import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SignedOut } from "../src/pages/SignedOut";

const goToLanding = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/goToLanding", () => ({ goToLanding }));

function mount(state?: { plain: boolean }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/signed-out", state }]}>
      <Routes><Route path="/signed-out" element={<SignedOut />} /></Routes>
    </MemoryRouter>
  );
}

beforeEach(() => { vi.useFakeTimers(); goToLanding.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("signed-out goodbye moment", () => {
  it("shows the meme with a plain signed-out line and continues on tap", () => {
    mount();
    expect(screen.getByText("You're signed out.")).toBeTruthy();
    expect(screen.getByRole("img", { name: /tussi jaa rahe ho/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue to the Alma Mater homepage" }));
    expect(goToLanding).toHaveBeenCalledTimes(1);
  });

  it("continues on its own after about two seconds", () => {
    mount();
    expect(goToLanding).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1999);
    expect(goToLanding).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(goToLanding).toHaveBeenCalledTimes(1);
  });

  it("skips the meme for the plain sign-out-everywhere arrival", () => {
    mount({ plain: true });
    expect(screen.getByText("You're signed out.")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    vi.advanceTimersByTime(2000);
    expect(goToLanding).toHaveBeenCalledTimes(1);
  });
});
