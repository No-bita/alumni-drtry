import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { lazy } from "react";
import { FoldToFlight, FoldToFlightGate } from "../src/components/FoldToFlight";
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("fold to flight", () => {
  it("folds by taps, launches and replays without requiring readiness", () => {
    render(<FoldToFlight ready={false} onEnter={vi.fn()} />);
    expect(screen.queryByText("Take me in")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /fold down/ }));
    fireEvent.click(screen.getByRole("button", { name: /corners in/ }));
    fireEvent.click(screen.getByRole("button", { name: /wings/ }));
    fireEvent.click(screen.getByRole("button", { name: /launch it/ }));
    expect(screen.getByText("That counts as flying.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fold another" }));
    expect(screen.getByText("Start with a fold.")).toBeTruthy();
  });
  it("preserves the fold on readiness, offers entry at any stage without auto entry", () => {
    const enter = vi.fn();
    const view = render(<FoldToFlight ready={false} onEnter={enter} />);
    fireEvent.click(screen.getByRole("button", { name: /fold down/ }));
    fireEvent.click(screen.getByRole("button", { name: /corners in/ }));
    view.rerender(<FoldToFlight ready onEnter={enter} />);
    expect(screen.getByText("Looks flight-ish.")).toBeTruthy();
    expect(enter).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Take me in" }));
    expect(enter).toHaveBeenCalledOnce();
  });
  it("reports an honest slow wait, clears timer on readiness, never claims a repair", () => {
    vi.useFakeTimers();
    const view = render(<FoldToFlight ready={false} onEnter={vi.fn()} />);
    act(() => vi.advanceTimersByTime(12_000));
    expect(screen.getByText("This is taking longer than expected.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload Alma" })).toBeTruthy();
    expect(screen.queryByText(/fixing|server|session expired|%/i)).toBeNull();
    view.rerender(<FoldToFlight ready onEnter={vi.fn()} />);
    expect(screen.queryByText("Reload Alma")).toBeNull();
    expect(screen.getByRole("button", { name: "Take me in" })).toBeTruthy();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("holds the destination inert until chosen, not just until auth resolves", async () => {
    const view = render(<FoldToFlightGate sessionReady={false}><button>Destination action</button></FoldToFlightGate>);
    fireEvent.click(screen.getByRole("button", { name: /fold down/ }));
    view.rerender(<FoldToFlightGate sessionReady><button>Destination action</button></FoldToFlightGate>);
    expect(screen.queryByRole("button", { name: "Destination action" })).toBeNull();
    expect(screen.getByText("Pointy end first.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Take me in" }));
    expect(screen.getByRole("button", { name: "Destination action" })).toBeTruthy();
    expect(screen.queryByText("Pointy end first.")).toBeNull();
  });
  it("does not advertise ready before the lazy destination resolves", async () => {
    let resolve!: (value: { default: () => React.ReactNode }) => void;
    const Page = lazy(() => new Promise<{ default: () => React.ReactNode }>(r => { resolve = r; }));
    render(<FoldToFlightGate sessionReady><Page /></FoldToFlightGate>);
    expect(screen.queryByText("Take me in")).toBeNull();
    await act(async () => resolve({ default: () => <p>Ready destination</p> }));
    expect(screen.getByRole("button", { name: "Take me in" })).toBeTruthy();
  });
  it("keys readiness to the current location and keeps the fold across a lazy redirect", async () => {
    let resolve!: (value: { default: () => React.ReactNode }) => void;
    const Next = lazy(() => new Promise<{ default: () => React.ReactNode }>(r => { resolve = r; }));
    window.history.pushState({}, "", "/profile");
    const view = render(<FoldToFlightGate sessionReady locationKey="/profile"><p>Redirecting</p></FoldToFlightGate>);
    fireEvent.click(screen.getByRole("button", { name: /fold down/ }));
    expect(screen.getByRole("button", { name: "Take me in" })).toBeTruthy();
    window.history.pushState({}, "", "/profiles/1");
    view.rerender(<FoldToFlightGate sessionReady locationKey="/profiles/1"><Next /></FoldToFlightGate>);
    expect(screen.queryByText("Take me in")).toBeNull();
    expect(screen.getByText("Pointy end first.")).toBeTruthy();
    await act(async () => resolve({ default: () => <p>Profile page</p> }));
    expect(screen.getByRole("button", { name: "Take me in" })).toBeTruthy();
    expect(screen.getByText("Pointy end first.")).toBeTruthy();
  });
  it("escapes signed-in shell spacing and keeps short viewports scrollable", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/components/FoldToFlight.css", "utf8");
    const surface = css.slice(css.indexOf(".fold-flight {"), css.indexOf(".fold-flight__brand"));
    expect(surface).toContain("position: fixed");
    expect(surface).toContain("inset: 0");
    expect(surface).toContain("overflow-y: auto");
  });
  it("does not count a redirect as ready when the browser URL already moved on", () => {
    window.history.pushState({}, "", "/profiles/1");
    render(<FoldToFlightGate sessionReady locationKey="/profile"><p>Redirecting</p></FoldToFlightGate>);
    expect(screen.queryByText("Take me in")).toBeNull();
  });
});
