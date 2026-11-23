import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/** Areas of experience: list rules and the editor with suggestions (the profile page itself: profilePage.test.tsx). */

const state = vi.hoisted(() => ({
  suggestions: [] as Array<{ label: string; memberCount: number }>,
  suggestCalls: [] as string[],
}));

vi.mock("../src/lib/assertApiGet", () => ({
  assertApiGet: vi.fn((path: string) => {
    state.suggestCalls.push(path);
    return Promise.resolve({ suggestions: state.suggestions });
  }),
}));

import { ProfileAreasEditor } from "../src/components/profile/ProfileAreasEditor";
import { addArea, areasChanged, normalizeAreasForSave, removeArea } from "../src/lib/personAreas";

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Harness({ start = [] as string[], onValue }: { start?: string[]; onValue?: (v: string[]) => void }) {
  const [areas, setAreas] = useState(start);
  return (
    <QueryClientProvider client={client()}>
      <ProfileAreasEditor
        draftAreas={areas}
        onDraftAreasChange={(next) => {
          setAreas(next);
          onValue?.(next);
        }}
      />
    </QueryClientProvider>
  );
}

const input = () => screen.getByRole("combobox", { name: "Add an area of experience" });
const chips = () => within(screen.getByRole("list", { name: "Your areas" })).getAllByRole("listitem").map((li) => li.firstChild?.textContent);

beforeEach(() => {
  state.suggestions = [];
  state.suggestCalls = [];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("area list rules", () => {
  it("normalises spacing, refuses repeats in any case, over-long areas and a ninth", () => {
    expect(addArea([], "  D2C   growth ")).toEqual({ ok: true, areas: ["D2C growth"] });
    expect(addArea(["Pricing"], "pricing")).toEqual({ ok: false, reason: "duplicate" });
    expect(addArea([], "x".repeat(41))).toEqual({ ok: false, reason: "too_long" });
    expect(addArea(Array.from({ length: 8 }, (_, i) => `A${i}`), "New")).toEqual({ ok: false, reason: "full" });
    expect(addArea([], "   ")).toEqual({ ok: false, reason: "empty" });
    expect(removeArea(["Pricing", "Ops"], "PRICING")).toEqual(["Ops"]);
  });

  it("only saves when the list really changed, order included", () => {
    expect(normalizeAreasForSave([" Pricing", "pricing", "", "Ops"])).toEqual(["Pricing", "Ops"]);
    expect(areasChanged(["Pricing"], ["Pricing "])).toBe(false);
    expect(areasChanged(["Pricing", "Ops"], ["Ops", "Pricing"])).toBe(true);
    expect(areasChanged([], ["Pricing"])).toBe(true);
  });
});

describe("areas editor", () => {
  it("leaves composition keys to the language keyboard, then adds on ordinary Enter", () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    fireEvent.change(input(), { target: { value: "ni" } });
    for (const key of ["Enter", ",", "ArrowDown", "ArrowUp", "Escape"]) {
      const event = new KeyboardEvent("keydown", { key, isComposing: true, bubbles: true, cancelable: true });
      fireEvent(input(), event);
      expect(event.defaultPrevented).toBe(false);
      expect((input() as HTMLInputElement).value).toBe("ni");
      expect(onValue).not.toHaveBeenCalled();
    }
    // WebKit may end composition before delivering this Enter.
    fireEvent.keyDown(input(), { key: "Enter", keyCode: 229 });
    expect((input() as HTMLInputElement).value).toBe("ni");
    expect(onValue).not.toHaveBeenCalled();
    fireEvent.change(input(), { target: { value: "你好" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(onValue).toHaveBeenCalledWith(["你好"]);
    expect((input() as HTMLInputElement).value).toBe("");
  });

  it("adds with Enter, the Add button or a comma, and removes a chip", () => {
    let last: string[] = [];
    render(<Harness onValue={(v) => (last = v)} />);
    fireEvent.change(input(), { target: { value: "Pricing" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    fireEvent.change(input(), { target: { value: "Supply chain" } });
    fireEvent.keyDown(input(), { key: "," });
    fireEvent.change(input(), { target: { value: "D2C growth" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(chips()).toEqual(["Pricing", "Supply chain", "D2C growth"]);
    expect((input() as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Remove Supply chain" }));
    expect(last).toEqual(["Pricing", "D2C growth"]);
    expect(screen.getByText(/\(2\/8\)/)).toBeTruthy();
  });

  it("says why an area wasn't added and stops at eight", () => {
    render(<Harness start={["Pricing"]} />);
    fireEvent.change(input(), { target: { value: "PRICING" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(screen.getByRole("status").textContent).toBe("You've already added that.");
    cleanup();
    render(<Harness start={Array.from({ length: 8 }, (_, i) => `Area ${i}`)} />);
    expect((input() as HTMLInputElement).disabled).toBe(true);
    expect((input() as HTMLInputElement).placeholder).toBe("You've added 8");
    expect((input() as HTMLInputElement).maxLength).toBe(40);
  });

  it("suggests areas other members use, hides ones already added, and picks with the keyboard", async () => {
    state.suggestions = [
      { label: "Pricing", memberCount: 4 },
      { label: "Dynamic pricing", memberCount: 1 },
    ];
    let last: string[] = [];
    render(<Harness start={["Pricing"]} onValue={(v) => (last = v)} />);
    fireEvent.change(input(), { target: { value: "pri" } });
    const option = await screen.findByRole("option", { name: /Dynamic pricing/ });
    expect(option.textContent).toContain("1 member");
    expect(screen.queryByRole("option", { name: /^Pricing/ })).toBeNull();
    expect(state.suggestCalls.at(-1)).toBe("/v1/areas/suggestions?q=pri");
    expect(input().getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().getAttribute("aria-activedescendant")).toBe(option.id);
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(last).toEqual(["Pricing", "Dynamic pricing"]);
  });

  it("doesn't ask for suggestions under two characters", async () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: "p" } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 260));
    });
    expect(state.suggestCalls).toEqual([]);
  });
});
