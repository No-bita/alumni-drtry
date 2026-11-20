import "../styles/wall-pinning.css";

/** A visible label and decorative pin, not a colour-only ranking indicator. */
export function WallPinBadge() {
  return <span className="wall-pin-badge">
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m12 2 6 6-2 1-3 4-2-2-5 6 4-7-2-2 4-3 0-3Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    Pinned
  </span>;
}
