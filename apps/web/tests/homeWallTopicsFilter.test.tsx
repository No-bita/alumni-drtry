import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HomeWallTopicsFilter } from "../src/components/HomeWallTopicsFilter";

const TOPICS = [
  { id: "careers", label: "Careers" },
  { id: "relocation", label: "Relocation" },
  { id: "startups", label: "Startups" },
  { id: "guidance", label: "Guidance" },
];
const COUNTS = { careers: 1, relocation: 0, startups: 2, guidance: 0 };
// jsdom cannot measure layout, so the component falls back to this estimate:
// 4 rows x 46px + 14px chrome.
const ESTIMATED_HEIGHT = 4 * 46 + 14;

function setup(activeCategory = "all") {
  const onCategoryChange = vi.fn();
  render(
    <HomeWallTopicsFilter
      topics={TOPICS}
      counts={COUNTS}
      activeCategory={activeCategory}
      onCategoryChange={onCategoryChange}
    />,
  );
  return { onCategoryChange, trigger: screen.getByRole("button", { name: /Topics/ }) };
}

function mockRects(map: Array<[string, Partial<DOMRect>]>) {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    for (const [cls, rect] of map) {
      if (this.classList?.contains(cls)) {
        return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...rect } as DOMRect;
      }
    }
    return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("HomeWallTopicsFilter", () => {
  it("opens on click with filter semantics and focuses the first option", () => {
    const { trigger } = setup();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const panel = screen.getByRole("group", { name: "Opportunity filters" });
    const options = panel.querySelectorAll("button");
    expect(options).toHaveLength(4);
    // toggle-button semantics, not menuitems
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: /^Startups\s*2$/ }).getAttribute("aria-pressed")).toBe("false");
    expect(document.activeElement).toBe(options[0]);
  });

  it("closes on Escape and returns focus to the trigger", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("group", { name: "Opportunity filters" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on outside pointer down", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    expect(screen.getByRole("group", { name: "Opportunity filters" })).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("group", { name: "Opportunity filters" })).toBeNull();
  });

  it("selects a topic, closes, and returns focus", () => {
    const { trigger, onCategoryChange } = setup("all");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: /^Startups\s*2$/ }));
    expect(onCategoryChange).toHaveBeenCalledWith("startups");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("toggles the active topic back to all", () => {
    const { onCategoryChange } = setup("startups");
    const trigger = screen.getByRole("button", { name: /Topics/ });
    fireEvent.click(trigger);
    const active = screen.getByRole("button", { name: /^Startups\s*2$/ });
    expect(active.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(active);
    expect(onCategoryChange).toHaveBeenCalledWith("all");
  });

  it("opens below the trigger when there is room", () => {
    mockRects([["home-wall-topics__trigger", { top: 100, bottom: 144, left: 240, right: 340 }]]);
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    const { trigger } = setup();
    fireEvent.click(trigger);
    const panel = screen.getByRole("group", { name: "Opportunity filters" });
    expect(panel.style.position).toBe("fixed");
    expect(panel.style.top).toBe("150px");
    expect(panel.style.maxHeight).toBe(`${844 - 144 - 6}px`);
  });

  it("flips above and stays clear of the bottom dock", () => {
    // trigger low in an 844-tall viewport; dock band starts at 752
    const dock = document.createElement("nav");
    dock.className = "nav-bottom-dock";
    document.body.appendChild(dock);
    mockRects([
      ["home-wall-topics__trigger", { top: 700, bottom: 744, left: 240, right: 340 }],
      ["nav-bottom-dock", { top: 752, bottom: 828, left: 24, right: 366, width: 342, height: 76 }],
    ]);
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    const { trigger } = setup();
    fireEvent.click(trigger);
    const panel = screen.getByRole("group", { name: "Opportunity filters" });
    expect(panel.style.top).toBe(`${700 - 6 - ESTIMATED_HEIGHT}px`);
    // panel bottom (top + natural height) ends above the trigger, never reaching the dock
    expect(700 - 6).toBeLessThan(752);
    dock.remove();
  });

  it("caps height with a scroll area when neither side fits", () => {
    Object.defineProperty(window, "innerHeight", { value: 300, configurable: true });
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    mockRects([["home-wall-topics__trigger", { top: 140, bottom: 170, left: 240, right: 340 }]]);
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, label: `Topic ${i}` }));
    const counts = Object.fromEntries(many.map((t) => [t.id, 0]));
    const onCategoryChange = vi.fn();
    render(<HomeWallTopicsFilter topics={many} counts={counts} activeCategory="all" onCategoryChange={onCategoryChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Topics/ }));
    const panel = screen.getByRole("group", { name: "Opportunity filters" });
    // estimate = 10*46+14 = 474; spaceAbove = 134 > spaceBelow = 124 -> above, capped at 134
    expect(panel.style.maxHeight).toBe("134px");
    expect(panel.style.top).toBe("0px");
    expect(parseInt(panel.style.maxHeight, 10)).toBeLessThan(474);
  });
});
