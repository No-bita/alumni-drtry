import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CityEmptyPrompt } from "../src/components/cities/CityEmptyPrompt";
import { CityHome } from "../src/components/cities/CityHome";
import { cityEmptyExample } from "../src/lib/cityEmptyExample";
import { WALL_EMPTY_SESSION_KEY } from "../src/lib/wallEmptyScript";
import type { CityPayload } from "../src/lib/cities";

const typed = () => screen.queryByTestId("wall-empty-typed")?.textContent;
let reduced = false;
beforeEach(() => {
  vi.useFakeTimers(); sessionStorage.clear(); reduced = false;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: reduced }) });
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const view = (city = "Bengaluru", placeId = "bengaluru", onAsk = vi.fn()) => render(<CityEmptyPrompt city={city} placeId={placeId} onAsk={onAsk} />);

describe("City empty community example", () => {
  it("uses only the approved city copy", () => {
    expect(cityEmptyExample("Bengaluru")).toBe("Looking for a flat in Indiranagar");
    expect(cityEmptyExample("Pune")).toBe("Looking for a flat in Pune");
    expect(cityEmptyExample("Delhi")).not.toContain("Indiranagar");
  });
  it("types the single example with a clear Example label, then settles", () => {
    view(); expect(screen.getByText("Example")).toBeTruthy();
    let sawFull = false;
    for (let i = 0; i < 800; i++) { act(() => void vi.advanceTimersByTime(10)); if (typed() === "Looking for a flat in Indiranagar") sawFull = true; }
    expect(sawFull).toBe(true); expect(screen.getByText("Your post here")).toBeTruthy(); expect(typed()).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("Home history does not suppress Cities, and Cities does not mark Home played", () => {
    sessionStorage.setItem(WALL_EMPTY_SESSION_KEY, "1"); view(); expect(screen.getByText("Example")).toBeTruthy(); cleanup(); sessionStorage.clear();
    view(); act(() => void vi.advanceTimersByTime(100)); expect(sessionStorage.getItem(WALL_EMPTY_SESSION_KEY)).toBeNull();
  });
  it("plays once per city per session while other cities remain independent", () => {
    const first = view(); act(() => void vi.advanceTimersByTime(100)); first.unmount();
    const repeat = view(); expect(screen.getByText("Your post here")).toBeTruthy(); repeat.unmount();
    view("Pune", "pune"); expect(screen.getByText("Example")).toBeTruthy(); act(() => void vi.advanceTimersByTime(1000)); expect(cityEmptyExample("Pune").startsWith(typed() ?? "")).toBe(true);
  });
  it("reduced motion shows the final button without timers", () => {
    reduced = true; view(); expect(screen.getByText("Your post here")).toBeTruthy(); act(() => void vi.advanceTimersByTime(10_000)); expect(typed()).toBeUndefined(); expect(vi.getTimerCount()).toBe(0);
  });
  it("card opens the existing ask flow and has a stable accessible name", () => {
    const ask = vi.fn(); view("Bengaluru", "bengaluru", ask); const button = screen.getByRole("button", { name: "Ask the Bengaluru community" }); fireEvent.click(button); expect(ask).toHaveBeenCalledTimes(1); expect(button.getAttribute("type")).toBe("button");
  });
  it("pauses on hidden tabs and cancels timers on unmount", () => {
    const v = view(); act(() => void vi.advanceTimersByTime(1000)); const before = typed();
    act(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); }); act(() => void vi.advanceTimersByTime(5000)); expect(typed()).toBe(before);
    act(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); }); act(() => void vi.advanceTimersByTime(500)); expect(typed()).not.toBe(before); v.unmount(); expect(vi.getTimerCount()).toBe(0);
  });
  it("CityHome shows examples only when empty and keeps Ask context", () => {
    const data = { place: { city: "Bengaluru", placeId: "bengaluru", country: "India" }, viewerRole: "local", counts: { alumni: 0, openToCityHelp: 0 }, offers: [], posts: [], postsHasMore: false, helpers: [], others: [] } as unknown as CityPayload;
    const onAsk = vi.fn(); const wrap = (d: CityPayload) => <MemoryRouter><CityHome data={d} profileId={null} onChanged={() => {}} onOptIn={() => {}} onAsk={onAsk} onNotice={() => {}} /></MemoryRouter>;
    const v = render(wrap(data)); fireEvent.click(screen.getByRole("button", { name: "Ask the Bengaluru community" })); expect(onAsk).toHaveBeenCalledWith({});
    v.rerender(wrap({ ...data, posts: [{ id: "real", content: "Actual community post", authorFullName: "Test Person", createdAt: "2026-11-12T10:00:00Z" } as CityPayload["posts"][number]] })); expect(screen.queryByText("Example")).toBeNull(); expect(screen.getByText("Actual community post")).toBeTruthy();
  });
});
