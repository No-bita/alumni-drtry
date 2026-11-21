import { useEffect, useRef, useState } from "react";
import { WALL_SHARE_AUDIENCE_NOTE, shareWallPost } from "../lib/wallShare";
import "../styles/wall-share.css";

/** How long the confirmation shows. A narrowed post's note stays a little longer so it can be read. */
export const WALL_SHARE_CONFIRM_MS = 2000;
export const WALL_SHARE_NOTE_MS = 5000;

function ShareNodesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="18" cy="5" r="2.6" />
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="18" cy="19" r="2.6" />
      <path d="M8.3 10.8l7.4-4.4M8.3 13.2l7.4 4.4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

type Props = {
  postId: string;
  /** The post's audience label when it's narrowed (null = Everyone): adds the "only its audience" note. */
  audienceLabel?: string | null;
  /** Icon only (Wall rows) or icon + "Share" (a post's detail sheet). */
  variant?: "icon" | "labelled";
};

/**
 * Share a Wall post's link: the phone's share sheet where there is one, otherwise copy it. A checkmark and
 * "Link copied" confirm a copy; a narrowed post also shows that only its audience can open the link. If
 * copying fails, nothing claims success and an inline message says so.
 */
export function WallShareButton({ postId, audienceLabel = null, variant = "icon" }: Props) {
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  const narrowed = Boolean(audienceLabel);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const show = (text: string | null, ok: boolean, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    setDone(ok);
    setMessage(text ? { text, tone: ok ? "ok" : "error" } : null);
    timer.current = setTimeout(() => {
      setDone(false);
      setMessage(null);
      timer.current = null;
    }, ms);
  };

  const onClick = async () => {
    if (busy.current) return;
    busy.current = true;
    const result = await shareWallPost(postId);
    busy.current = false;
    if (result === "cancelled") return;
    if (result === "failed") {
      show("Couldn't copy the link. Try again.", false, WALL_SHARE_NOTE_MS);
      return;
    }
    const base = result === "copied" ? "Link copied." : "Shared.";
    if (narrowed) show(`${base} ${WALL_SHARE_AUDIENCE_NOTE}`, true, WALL_SHARE_NOTE_MS);
    else show(result === "copied" ? "Link copied." : null, true, WALL_SHARE_CONFIRM_MS);
  };

  const label = done ? "Link shared" : "Share this post";
  return (
    <span className={`wall-share wall-share--${variant}`}>
      <button
        type="button"
        className={`wall-share__btn${done ? " wall-share__btn--done" : ""}`}
        aria-label={variant === "icon" ? label : undefined}
        onClick={() => void onClick()}
      >
        {done ? <CheckIcon /> : <ShareNodesIcon />}
        {variant === "labelled" ? <span>Share</span> : null}
      </button>
      {/* Visible for a narrowed post's note and for errors; screen readers hear every confirmation. */}
      <span
        className={`wall-share__msg${message && (narrowed || message.tone === "error" || variant === "labelled") ? " wall-share__msg--visible" : ""}${message?.tone === "error" ? " wall-share__msg--error" : ""}`}
        role="status"
        aria-live="polite"
      >
        {message?.text ?? ""}
      </span>
    </span>
  );
}
