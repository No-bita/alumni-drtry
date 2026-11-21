import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, type IntentcastFeedItem } from "../api/client";
import { parseWallHash, wallPostAnchorId } from "../lib/wallShare";

/** How long "Shared with you" and the highlight stay, counted from when the post is actually on screen. */
export const WALL_SHARE_HIGHLIGHT_MS = 10_000;

export const WALL_SHARE_UNAVAILABLE = "That post isn't available anymore.";

/** waiting: feed loading, or asking the single-post API · fetched: found there · scrolled · unavailable */
type Phase = "idle" | "waiting" | "fetched" | "scrolled" | "unavailable";

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;
  } catch {
    return false;
  }
}

/**
 * A Wall post the viewer may see right now (the single-post API also returns the author's own closed posts).
 * No expiry check: automatic expiry is paused (#244), so an open post past its old expiry still shows.
 */
export function isLiveOnWall(item: IntentcastFeedItem | undefined | null): item is IntentcastFeedItem {
  if (!item) return false;
  if (item.authorSoftDeletedAt) return false;
  if (item.status === "closed") return false;
  return true;
}

/**
 * Opening The Wall with `#wall-<post id>` (a copied post link): once the feed has loaded, find the post
 * (in the loaded feed, or else through the existing signed-in single-post API, which applies the same
 * visibility rules as the feed, post audience included), scroll to it, and mark it "Shared with you" for 10 seconds after it comes
 * into view. A post the viewer can't see gets the "isn't available anymore" notice. The `#…` is then
 * removed from the address bar without a new history entry.
 */
export function useWallShareTarget({
  intentcasts,
  feedLoading,
  ensureVisible,
}: {
  intentcasts: IntentcastFeedItem[];
  feedLoading: boolean;
  /** Called once the post is found, so the Wall can switch to a view that shows it (e.g. "All" topics). Keep it stable. */
  ensureVisible: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const hashId = parseWallHash(location.hash);
  const [targetId, setTargetId] = useState<string | null>(hashId);
  const [phase, setPhase] = useState<Phase>(hashId ? "waiting" : "idle");
  const [extraPost, setExtraPost] = useState<IntentcastFeedItem | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // A new `#wall-…` (e.g. a second link opened in the same tab) starts over. Removing the hash doesn't.
  const [lastHashId, setLastHashId] = useState<string | null>(hashId);
  if (hashId !== lastHashId) {
    setLastHashId(hashId);
    if (hashId) {
      setTargetId(hashId);
      setPhase("waiting");
      setExtraPost(null);
      setHighlightedId(null);
      setNotice(null);
    }
  }

  const { pathname, search, hash, state } = location;
  const clearHash = useCallback(() => {
    if (!parseWallHash(hash)) return;
    navigate({ pathname, search }, { replace: true, state });
  }, [navigate, pathname, search, hash, state]);

  const inLoadedFeed = Boolean(targetId) && isLiveOnWall(intentcasts.find((ic) => ic.id === targetId));
  const lookingUp = phase === "waiting" && !feedLoading;
  /** Found and not yet scrolled to. */
  const ready = (lookingUp && inLoadedFeed) || phase === "fetched";

  // Not in the loaded feed: ask the single-post API (signed in; same visibility rules as the feed).
  useEffect(() => {
    if (!lookingUp || inLoadedFeed || !targetId) return undefined;
    const controller = new AbortController();
    void (async () => {
      const res = await api.get<{ intentcast: IntentcastFeedItem }>(`/v1/intentcasts/${targetId}`, { signal: controller.signal });
      if (res.aborted || controller.signal.aborted) return;
      const found = res.data?.intentcast;
      if (found && found.id === targetId && isLiveOnWall(found)) {
        setExtraPost(found);
        setPhase("fetched");
        return;
      }
      setNotice(WALL_SHARE_UNAVAILABLE);
      setPhase("unavailable");
      clearHash();
    })();
    return () => controller.abort();
  }, [lookingUp, inLoadedFeed, targetId, clearHash]);

  // Found: make sure the Wall shows it, then scroll to it and highlight it.
  useEffect(() => {
    if (!ready || !targetId) return undefined;
    let frame = 0;
    let tries = 0;
    let shown = false;
    const scrollWhenRendered = () => {
      if (!shown) {
        shown = true;
        ensureVisible();
      }
      const el = document.getElementById(wallPostAnchorId(targetId));
      if (!el) {
        tries += 1;
        if (tries < 60) frame = window.requestAnimationFrame(scrollWhenRendered);
        return;
      }
      el.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      try {
        el.focus({ preventScroll: true });
      } catch {
        /* focus is best-effort */
      }
      setHighlightedId(targetId);
      setPhase("scrolled");
      clearHash();
    };
    frame = window.requestAnimationFrame(scrollWhenRendered);
    return () => window.cancelAnimationFrame(frame);
  }, [ready, targetId, ensureVisible, clearHash]);

  // The 10 seconds start when the post is actually in view.
  useEffect(() => {
    if (!highlightedId) return undefined;
    const el = document.getElementById(wallPostAnchorId(highlightedId));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const start = () => {
      if (timer) return;
      timer = setTimeout(() => setHighlightedId(null), WALL_SHARE_HIGHLIGHT_MS);
    };
    let observer: IntersectionObserver | null = null;
    if (el && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          start();
          observer?.disconnect();
        }
      });
      observer.observe(el);
    } else {
      // No observer (very old browsers): count from now.
      const t = setTimeout(start, 0);
      return () => {
        clearTimeout(t);
        if (timer) clearTimeout(timer);
      };
    }
    return () => {
      observer?.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [highlightedId]);

  return {
    /** A shared post that wasn't in the loaded feed (shown at the top of The Wall). */
    extraPost: phase === "fetched" || phase === "scrolled" ? extraPost : null,
    highlightedId,
    notice,
    dismissNotice: () => setNotice(null),
  };
}
