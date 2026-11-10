import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { IntentcastFeedItem } from "../src/api/client";
import { HomeOpportunityRail } from "../src/components/HomeOpportunityRail";
import {
  WALL_EMPTY_EXAMPLES,
  WALL_EMPTY_FINAL_TEXT,
  WALL_EMPTY_SESSION_KEY,
  buildWallEmptyScript,
} from "../src/lib/wallEmptyScript";

vi.mock("../src/components/CareerIntentFeedRows", () => ({
  IntentcastActivityRowsList: ({ rows }: { rows: Array<{ roleHeader: string }> }) => (
    <div>{rows.map((row) => <p key={row.roleHeader}>{row.roleHeader}</p>)}</div>
  ),
}));

const EMPTY_COUNTS = { careers: 0, hiring: 0, relocation: 0, startups: 0, guidance: 0, replies: 0 };
const POST: IntentcastFeedItem = {
  id: "p1", authorPersonId: "a1", authorFullName: "Test Author",
  authorDepartmentCode: "CSE", authorDepartmentName: "Computer Science",
  category: "collaboration", content: "[[cat:startups]]\nTest project\nDetails for the project.",
  status: "active", expiresAt: "2026-12-01T00:00:00Z", closedAt: null,
  createdAt: "2026-11-01T00:00:00Z", editableUntil: "2026-11-02T00:00:00Z",
  responseCount: 0, viewerHasResponded: false,
};

function renderRail(props: { intentcasts?: IntentcastFeedItem[]; counts?: typeof EMPTY_COUNTS; onPost?: () => void } = {}) {
  const onPost = props.onPost ?? vi.fn();
  const view = render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <HomeOpportunityRail
          intentcasts={props.intentcasts ?? []}
          activeCategory="all"
          onCategoryChange={() => {}}
          categoryCounts={props.counts ?? EMPTY_COUNTS}
          onPost={onPost}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { ...view, onPost };
}

const typed = () => screen.queryByTestId("wall-empty-typed")?.textContent ?? null;
const postButton = () => screen.getByRole("button", { name: "Post to The Wall" });
const totalScriptMs = () => buildWallEmptyScript().reduce((sum, s) => sum + s.delay, 0) + 2000;

function setReducedMotion(reduce: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  window.sessionStorage.clear();
  setReducedMotion(false);
  setHidden(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Empty Wall: example posts typing in, then a ripple on Post to The Wall", () => {
  it("types each example in order, settles on 'Your post here', then ripples the button once", () => {
    renderRail();
    const card = screen.getByRole("button", { name: "Write your first post on The Wall" });
    expect(card.textContent).toContain("Example");

    act(() => void vi.advanceTimersByTime(1000));
    const early = typed() ?? "";
    expect(early.length).toBeGreaterThan(0);
    expect(WALL_EMPTY_EXAMPLES[0].startsWith(early)).toBe(true);

    // Run until the first example is fully typed (it holds there), then the second starts after deletion.
    let sawSecond = false;
    let sawThird = false;
    let sawFirstFull = false;
    for (let i = 0; i < 4000 && screen.queryByTestId("wall-empty-typed"); i += 1) {
      act(() => void vi.advanceTimersByTime(10));
      const t = typed() ?? "";
      if (t === WALL_EMPTY_EXAMPLES[0]) sawFirstFull = true;
      if (sawFirstFull && t.length > 5 && WALL_EMPTY_EXAMPLES[1].startsWith(t)) sawSecond = true;
      if (sawSecond && t.length > 5 && WALL_EMPTY_EXAMPLES[2].startsWith(t)) sawThird = true;
    }
    expect(sawFirstFull && sawSecond && sawThird).toBe(true);

    // The loop stops the moment the card settles, so the ripple is still playing.
    expect(typed()).toBeNull();
    expect(card.textContent).toContain(WALL_EMPTY_FINAL_TEXT);
    expect(card.textContent).not.toContain("Example");
    expect(postButton().className).toContain("home-ideal__opportunities-post--ripple");

    act(() => void vi.advanceTimersByTime(1400));
    expect(postButton().className).not.toContain("--ripple");

    // It stops for good: nothing more is scheduled.
    act(() => void vi.advanceTimersByTime(60_000));
    expect(card.textContent).toContain(WALL_EMPTY_FINAL_TEXT);
  });

  it("plays once per browser session: later views show the final card straight away, with no ripple", () => {
    const first = renderRail();
    act(() => void vi.advanceTimersByTime(500));
    expect(window.sessionStorage.getItem(WALL_EMPTY_SESSION_KEY)).toBe("1");
    first.unmount();

    renderRail();
    const card = screen.getByRole("button", { name: "Write your first post on The Wall" });
    expect(card.textContent).toContain(WALL_EMPTY_FINAL_TEXT);
    expect(typed()).toBeNull();
    act(() => void vi.advanceTimersByTime(totalScriptMs()));
    expect(postButton().className).not.toContain("--ripple");
  });

  it("with reduced motion shows the final card at once, with no typing and no ripple", () => {
    setReducedMotion(true);
    renderRail();
    expect(screen.getByRole("button", { name: "Write your first post on The Wall" }).textContent).toContain(WALL_EMPTY_FINAL_TEXT);
    expect(typed()).toBeNull();
    act(() => void vi.advanceTimersByTime(totalScriptMs()));
    expect(postButton().className).not.toContain("--ripple");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("the card opens the post flow on click, and is a real button for Enter and Space", () => {
    const { onPost } = renderRail();
    const card = screen.getByRole("button", { name: "Write your first post on The Wall" });
    expect(card.tagName).toBe("BUTTON");
    expect(card.getAttribute("type")).toBe("button");
    fireEvent.click(card);
    expect(onPost).toHaveBeenCalledTimes(1);
    fireEvent.click(postButton());
    expect(onPost).toHaveBeenCalledTimes(2);
  });

  it("screen readers get a stable name, never the characters being typed", () => {
    renderRail();
    act(() => void vi.advanceTimersByTime(1500));
    const card = screen.getByRole("button", { name: "Write your first post on The Wall" });
    expect(card.getAttribute("aria-label")).toBe("Write your first post on The Wall");
    expect(screen.getByTestId("wall-empty-typed").getAttribute("aria-hidden")).toBe("true");
    expect(card.querySelector("[aria-live]")).toBeNull();
  });

  it("is not shown when there are posts, and disappears if posts arrive later", () => {
    const view = renderRail({ intentcasts: [POST], counts: { ...EMPTY_COUNTS, startups: 1 } });
    expect(screen.queryByRole("button", { name: "Write your first post on The Wall" })).toBeNull();
    view.unmount();

    const empty = renderRail();
    expect(screen.getByRole("button", { name: "Write your first post on The Wall" })).toBeTruthy();
    empty.rerender(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <HomeOpportunityRail
            intentcasts={[POST]}
            activeCategory="all"
            onCategoryChange={() => {}}
            categoryCounts={{ ...EMPTY_COUNTS, startups: 1 }}
            onPost={empty.onPost}
          />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: "Write your first post on The Wall" })).toBeNull();
  });

  it("pauses while the tab is hidden and resumes when it's visible again", () => {
    renderRail();
    act(() => void vi.advanceTimersByTime(1200));
    const before = typed();
    act(() => setHidden(true));
    act(() => void vi.advanceTimersByTime(5000));
    expect(typed()).toBe(before);
    act(() => setHidden(false));
    act(() => void vi.advanceTimersByTime(800));
    expect((typed() ?? "").length).toBeGreaterThan((before ?? "").length);
  });

  it("clears its timers on unmount", () => {
    const view = renderRail();
    act(() => void vi.advanceTimersByTime(1200));
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("the script holds each finished example and ends on the final frame", () => {
    const script = buildWallEmptyScript();
    const full0 = script.findIndex((s) => s.text === WALL_EMPTY_EXAMPLES[0]);
    expect(script[full0]!.delay).toBe(1600);
    expect(script[script.length - 1]).toMatchObject({ text: WALL_EMPTY_FINAL_TEXT, final: true });
    expect(script.filter((s) => s.final)).toHaveLength(1);
  });
});
