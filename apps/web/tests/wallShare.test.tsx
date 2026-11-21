import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { IntentcastFeedItem } from "../src/api/client";
import type { CityPayload } from "../src/lib/cities";

const apiGet = vi.hoisted(() => vi.fn());
vi.mock("../src/api/client", async (orig) => {
  const real = await orig<typeof import("../src/api/client")>();
  return { ...real, api: { ...real.api, get: apiGet } };
});

import { HomeOpportunityRail } from "../src/components/HomeOpportunityRail";
import { WallShareButton, WALL_SHARE_CONFIRM_MS, WALL_SHARE_NOTE_MS } from "../src/components/WallShareButton";
import { CityHome } from "../src/components/cities/CityHome";
import { WALL_SHARE_HIGHLIGHT_MS, WALL_SHARE_UNAVAILABLE } from "../src/hooks/useWallShareTarget";
import { parseWallHash, shareWallPost, wallPostAnchorId, wallPostShareUrl } from "../src/lib/wallShare";
import { rememberReturnTo, safeReturnPath, takeReturnTo } from "../src/lib/returnTo";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_GONE = "33333333-3333-4333-8333-333333333333";
const URL_A = `${window.location.origin}/app/home#wall-${ID_A}`;

function post(id: string, title: string, over: Partial<IntentcastFeedItem> = {}): IntentcastFeedItem {
  return {
    id,
    authorPersonId: `author-${id.slice(0, 4)}`,
    authorFullName: "Test Author",
    authorDepartmentCode: "CSE",
    authorDepartmentName: "Computer Science",
    category: "collaboration",
    content: `[[cat:startups]]\n${title}\nDetails for ${title}.`,
    status: "open",
    expiresAt: "2026-11-02T00:00:00Z", // past: expiry is paused (#244), so it still counts as live
    closedAt: null,
    createdAt: "2026-11-01T00:00:00Z",
    editableUntil: "2026-11-02T00:00:00Z",
    responseCount: 0,
    viewerHasResponded: false,
    ...over,
  } as IntentcastFeedItem;
}

const COUNTS = { careers: 0, hiring: 0, relocation: 0, startups: 2, guidance: 0, general: 0, replies: 0 };

let lastPath = "";
function LocationProbe() {
  const loc = useLocation();
  useEffect(() => {
    lastPath = `${loc.pathname}${loc.search}${loc.hash}`;
  }, [loc]);
  return null;
}

let ioCallbacks: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
const scrollIntoView = vi.fn();
let reducedMotion = false;
let coarsePointer = false;

function stubNavigator(extra: Record<string, unknown>) {
  vi.stubGlobal("navigator", { ...navigator, share: undefined, ...extra });
}

beforeEach(() => {
  vi.useFakeTimers();
  ioCallbacks = [];
  scrollIntoView.mockReset();
  apiGet.mockReset();
  reducedMotion = false;
  coarsePointer = false;
  lastPath = "";
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
        ioCallbacks.push(cb);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => setTimeout(() => fn(0), 16) as unknown as number);
  vi.stubGlobal("cancelAnimationFrame", (h: number) => clearTimeout(h));
  window.matchMedia = ((q: string) => ({
    matches: (reducedMotion && q.includes("reduce")) || (coarsePointer && q.includes("coarse")),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = scrollIntoView as unknown as Element["scrollIntoView"];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderWall({ at = "/home", intentcasts = [post(ID_A, "First post"), post(ID_B, "Second post")] } = {}) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <QueryClientProvider client={new QueryClient()}>
        <LocationProbe />
        <HomeOpportunityRail
          intentcasts={intentcasts}
          activeCategory="all"
          onCategoryChange={() => {}}
          categoryCounts={COUNTS}
          viewerPersonId="viewer"
          onPost={() => {}}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function flushFrames() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
}

describe("share links", () => {
  it("point at The Wall (Home, under the app base) with only the post id after #", () => {
    expect(wallPostShareUrl(ID_A, "https://almamatter.in")).toBe(`https://almamatter.in/app/home#wall-${ID_A}`);
    expect(wallPostAnchorId(ID_A)).toBe(`wall-${ID_A}`);
    expect(parseWallHash(`#wall-${ID_A}`)).toBe(ID_A);
    expect(parseWallHash(`#wall-${ID_A.toUpperCase()}`)).toBe(ID_A);
    expect(parseWallHash("#wall-not-a-uuid")).toBeNull();
    expect(parseWallHash("#something-else")).toBeNull();
  });
});

describe("sharing", () => {
  it("phones with a share sheet: opens it with the link only (no post text)", async () => {
    coarsePointer = true;
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    stubNavigator({ share, clipboard: { writeText } });
    await expect(shareWallPost(ID_A)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ url: URL_A });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("closing the share sheet is a cancel (nothing copied, no message)", async () => {
    coarsePointer = true;
    const abort = Object.assign(new Error("cancelled"), { name: "AbortError" });
    stubNavigator({ share: vi.fn().mockRejectedValue(abort), clipboard: { writeText: vi.fn() } });
    await expect(shareWallPost(ID_A)).resolves.toBe("cancelled");
  });

  it("desktop (no touch pointer) copies, even when the browser has a share sheet", async () => {
    const share = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, clipboard: { writeText } });
    await expect(shareWallPost(ID_A)).resolves.toBe("copied");
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(URL_A);
  });

  it("button: checkmark and 'Copied.' for 2 seconds, read out but not shown for an Everyone post", async () => {
    stubNavigator({ clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<WallShareButton postId={ID_A} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share this post" }));
    });
    expect(screen.getByRole("button", { name: "Link shared" })).toBeTruthy();
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Copied.");
    expect(status.classList.contains("wall-share__msg--visible")).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WALL_SHARE_CONFIRM_MS);
    });
    expect(screen.getByRole("button", { name: "Share this post" })).toBeTruthy();
    expect(status.textContent).toBe("");
  });

  it("a narrowed post shows the same short confirmation", async () => {
    stubNavigator({ clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<WallShareButton postId={ID_A} audienceLabel="IIT (BHU) Varanasi · Bengaluru" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share this post" }));
    });
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Copied.");
    expect(status.classList.contains("wall-share__msg--visible")).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WALL_SHARE_NOTE_MS);
    });
    expect(status.textContent).toBe("");
  });

  it("if copying fails, nothing claims success and the message says so", async () => {
    stubNavigator({ clipboard: undefined });
    document.execCommand = vi.fn().mockReturnValue(false) as unknown as typeof document.execCommand;
    render(<WallShareButton postId={ID_A} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share this post" }));
    });
    expect(screen.queryByRole("button", { name: "Link shared" })).toBeNull();
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Couldn't copy the link. Try again.");
    expect(status.classList.contains("wall-share__msg--error")).toBe(true);
  });

  it("sits beside each post's time on The Wall, and each post is a link target", () => {
    renderWall();
    const buttons = screen.getAllByRole("button", { name: "Share this post" });
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.closest(".career-feed-rows__rail-bottom")?.querySelector("time")).toBeTruthy();
    expect(buttons[0]!.closest("li")?.id).toBe(`wall-${ID_A}`);
  });
});

describe("opening a shared link", () => {
  it("scrolls to the post, shows 'Shared with you' until 10 seconds after it's on screen, and tidies the address", async () => {
    renderWall({ at: `/home#wall-${ID_B}` });
    await flushFrames();
    const target = document.getElementById(`wall-${ID_B}`)!;
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(target);
    expect(scrollIntoView.mock.calls[0]![0]).toEqual({ block: "center", behavior: "smooth" });
    expect(target.classList.contains("career-feed-rows__item--shared")).toBe(true);
    expect(within(target).getByText("Shared with you")).toBeTruthy();
    expect(document.getElementById(`wall-${ID_A}`)!.classList.contains("career-feed-rows__item--shared")).toBe(false);
    expect(lastPath).toBe("/home");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByText("Shared with you")).toBeTruthy();
    act(() => ioCallbacks.forEach((cb) => cb([{ isIntersecting: true }])));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WALL_SHARE_HIGHLIGHT_MS);
    });
    expect(screen.queryByText("Shared with you")).toBeNull();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("reduced motion: jumps without smooth scrolling", async () => {
    reducedMotion = true;
    renderWall({ at: `/home#wall-${ID_A}` });
    await flushFrames();
    expect(scrollIntoView.mock.calls[0]![0]).toEqual({ block: "center", behavior: "auto" });
  });

  it("a post not in the loaded feed is fetched (signed-in API, audience rules apply) and shown first", async () => {
    apiGet.mockResolvedValue({ data: { intentcast: post(ID_GONE, "Older shared post") } });
    renderWall({ at: `/home#wall-${ID_GONE}` });
    await flushFrames();
    await flushFrames();
    expect(apiGet).toHaveBeenCalledWith(`/v1/intentcasts/${ID_GONE}`, expect.anything());
    expect(document.querySelectorAll("li[id^='wall-']")[0]!.id).toBe(`wall-${ID_GONE}`);
    expect(screen.getByText("Shared with you")).toBeTruthy();
  });

  it("an unavailable post (outside its audience, closed or removed) shows the notice and nothing is highlighted", async () => {
    apiGet.mockResolvedValue({ error: { code: "INTENTCAST_NOT_FOUND", message: "Intentcast not found." }, status: 404 });
    renderWall({ at: `/home#wall-${ID_GONE}` });
    await flushFrames();
    expect(screen.getByText(WALL_SHARE_UNAVAILABLE, { exact: false }).closest("[role='status']")).toBeTruthy();
    expect(screen.queryByText("Shared with you")).toBeNull();
    expect(lastPath).toBe("/home");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(WALL_SHARE_UNAVAILABLE)).toBeNull();

    cleanup();
    apiGet.mockResolvedValue({ data: { intentcast: post(ID_GONE, "Closed", { status: "closed" }) } });
    renderWall({ at: `/home#wall-${ID_GONE}` });
    await flushFrames();
    expect(screen.getByText(WALL_SHARE_UNAVAILABLE, { exact: false })).toBeTruthy();
  });

  it("other #… values and plain visits do nothing", async () => {
    renderWall({ at: "/home#wall-nope" });
    await flushFrames();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(apiGet).not.toHaveBeenCalled();
  });
});

describe("Cities: share from a post's detail sheet", () => {
  it("the post sheet has a labelled Share button for that post", async () => {
    stubNavigator({ clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const city = {
      place: { placeId: "blr", city: "Bengaluru", country: "India", slug: "bengaluru" },
      viewerRole: "local",
      viewerCity: null,
      v1Enabled: true,
      counts: { alumni: 4, openToCityHelp: 1 },
      arrivalPrompt: false,
      arrivals: null,
      myArrival: null,
      offers: [],
      helpPanel: null,
      alumni: null,
      posts: [{ id: ID_A, authorPersonId: "a", authorFullName: "Asha Kamath", authorBatchYear: 2019, content: "Flatmate near HSR\nFrom January", kind: "ask", createdAt: new Date().toISOString(), viewerHasResponded: false, isMine: false }],
      postsHasMore: false,
      chapterLink: null,
      helpers: [],
      others: [],
      pendingCityAsks: 0,
      country: null,
    } as CityPayload;
    render(
      <MemoryRouter>
        <CityHome data={city} profileId={null} onChanged={() => {}} onOptIn={() => {}} onAsk={() => {}} onNotice={() => {}} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Flatmate near HSR/ }));
    const dialog = screen.getByRole("dialog");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Share this post" }));
    });
    expect((navigator.clipboard.writeText as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(URL_A);
    expect(within(dialog).getByRole("status").textContent).toBe("Copied.");
  });
});

describe("sign-in keeps the link's #wall-…", () => {
  it("remembers the path with its hash and gives it back after sign-in", () => {
    rememberReturnTo(`/home#wall-${ID_A}`);
    expect(takeReturnTo()).toBe(`/home#wall-${ID_A}`);
    expect(takeReturnTo()).toBeNull();
  });

  it("never returns to sign-in pages, even with a hash (no loops)", () => {
    expect(safeReturnPath(`/login#wall-${ID_A}`)).toBeNull();
    expect(safeReturnPath(`//evil.example/#wall-${ID_A}`)).toBeNull();
  });
});
