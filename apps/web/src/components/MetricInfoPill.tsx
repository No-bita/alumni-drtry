import { useId, useState } from "react";

/**
 * Small outlined "i" beside a metric value. Hover or keyboard focus previews the
 * explanation; click/tap pins it open; Escape closes a pinned explanation.
 */
export function MetricInfoPill({ label, text }: { label: string; text: string }) {
  const [pinned, setPinned] = useState(false);
  const bubbleId = useId();
  return (
    <span className={`aa-info${pinned ? " aa-info--pinned" : ""}`}>
      <button
        type="button"
        className="aa-info__btn"
        aria-label={`About this metric: ${label}`}
        aria-expanded={pinned}
        aria-describedby={pinned ? bubbleId : undefined}
        onClick={() => setPinned((p) => !p)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setPinned(false);
          }
        }}
      >
        i
      </button>
      <span className="aa-info__bubble" role="note" id={bubbleId}>
        {text}
      </span>
    </span>
  );
}
