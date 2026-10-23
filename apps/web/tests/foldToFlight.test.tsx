import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { lazy } from "react";
import { FoldToFlight, FoldToFlightGate } from "../src/components/FoldToFlight";
afterEach(() => { cleanup(); vi.useRealTimers(); });
type Lazy = { default: () => React.ReactNode };
function deferred() {
  let resolve!: (v: Lazy) => void;
  const Page = lazy(() => new Promise<Lazy>(r => { resolve = r; }));
  return { Page, resolve: (text: string) => act(async () => resolve({ default: () => <p>{text}</p> })) };
}
describe("fold to flight", () => {
  it("folds by taps, launches and replays without requiring readiness", () => {
    render(<FoldToFlight ready={false} />);
    fireEvent.click(screen.getByRole("button", { name: /fold down/ }));
    fireEvent.click(screen.getByRole("button", { name: /corners in/ }));
    fireEvent.click(screen.getByRole("button", { name: /wings/ }));
    fireEvent.click(screen.getByRole("button", { name: /launch it/ }));
    expect(screen.getByText("That counts as flying.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fold another" }));
    expect(screen.getByText("Start with a fold.")).toBeTruthy();
  });
  it("has no manual entry button", () => {
    render(<FoldToFlight ready />);
    expect(screen.queryByRole("button", { name: "Take me in" })).toBeNull();
  });
  it("reports an honest slow wait after 5s, clears timer on readiness, never claims a repair", () => {
    vi.useFakeTimers();
    const view = render(<FoldToFlight ready={false} />);
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByText("This is taking longer than expected.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload Alma" })).toBeTruthy();
    expect(screen.queryByText(/fixing|server|session expired|%/i)).toBeNull();
    view.rerender(<FoldToFlight ready />);
    expect(screen.queryByText("Reload Alma")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("restarts the slow wait for each new loading interval", () => {
    vi.useFakeTimers();
    const view = render(<FoldToFlight ready={false} />);
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByText("This is taking longer than expected.")).toBeTruthy();
    view.rerender(<FoldToFlight ready />);
    view.rerender(<FoldToFlight ready={false} />);
    expect(screen.queryByText("This is taking longer than expected.")).toBeNull();
    act(() => vi.advanceTimersByTime(4_999));
    expect(screen.queryByText("This is taking longer than expected.")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("This is taking longer than expected.")).toBeTruthy();
  });
  it("holds the destination inert until the session resolves, then enters on its own", () => {
    const view = render(<FoldToFlightGate sessionReady={false}><button>Destination action</button></FoldToFlightGate>);
    fireEvent.click(screen.getByRole("button", { name: /fold down/ }));
    expect(screen.queryByRole("button", { name: "Destination action" })).toBeNull();
    expect(screen.getByText("Pointy end first.")).toBeTruthy();
    view.rerender(<FoldToFlightGate sessionReady><button>Destination action</button></FoldToFlightGate>);
    expect(screen.getByRole("button", { name: "Destination action" })).toBeTruthy();
    expect(screen.queryByText("Pointy end first.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Take me in" })).toBeNull();
  });
  it("keeps playing until the lazy destination resolves, then enters automatically", async () => {
    const { Page, resolve } = deferred();
    render(<FoldToFlightGate sessionReady><Page /></FoldToFlightGate>);
    fireEvent.click(screen.getByRole("button", { name: /fold down/ }));
    expect(screen.getByText("Pointy end first.")).toBeTruthy();
    await resolve("Ready destination");
    expect(screen.getByText("Ready destination")).toBeTruthy();
    expect(screen.queryByText("Pointy end first.")).toBeNull();
  });
  it("does not enter on a redirect page, only once the redirect target has loaded", async () => {
    const { Page, resolve } = deferred();
    window.history.pushState({}, "", "/profiles/1");
    const view = render(<FoldToFlightGate sessionReady locationKey="/profile"><p>Redirecting</p></FoldToFlightGate>);
    fireEvent.click(screen.getByRole("button", { name: /fold down/ }));
    expect(screen.getByText("Pointy end first.")).toBeTruthy();
    view.rerender(<FoldToFlightGate sessionReady locationKey="/profiles/1"><Page /></FoldToFlightGate>);
    expect(screen.getByText("Pointy end first.")).toBeTruthy();
    await resolve("Profile page");
    expect(screen.getByText("Profile page")).toBeTruthy();
    expect(screen.queryByText("Pointy end first.")).toBeNull();
  });
  it("never brings the play surface back after entering", async () => {
    const { Page, resolve } = deferred();
    window.history.pushState({}, "", "/a");
    const view = render(<FoldToFlightGate sessionReady locationKey="/a"><p>A page</p></FoldToFlightGate>);
    expect(screen.getByText("A page")).toBeTruthy();
    window.history.pushState({}, "", "/b");
    view.rerender(<FoldToFlightGate sessionReady locationKey="/b"><Page /></FoldToFlightGate>);
    expect(screen.queryByText("Start with a fold.")).toBeNull();
    await resolve("B page");
    expect(screen.getByText("B page")).toBeTruthy();
  });
  it("escapes signed-in shell spacing and keeps short viewports scrollable", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/components/FoldToFlight.css", "utf8");
    const surface = css.slice(css.indexOf(".fold-flight {"), css.indexOf(".fold-flight__brand"));
    expect(surface).toContain("position: fixed");
    expect(surface).toContain("inset: 0");
    expect(surface).toContain("overflow-y: auto");
  });
});
