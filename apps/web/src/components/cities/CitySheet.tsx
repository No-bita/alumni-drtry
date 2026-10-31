import { useId, useRef, type ReactNode } from "react";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useDialogFocusManager } from "../../hooks/useDialogFocusManager";
import "../../styles/cities.css";

type CitySheetProps = {
  title: ReactNode;
  /** Small caps line above the title (e.g. "City updated"). */
  eyebrow?: string;
  /** Shown left of the title: initials avatar etc. */
  lead?: ReactNode;
  subtitle?: ReactNode;
  /** While sending, Escape and the backdrop don't close. */
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Display-font title (opt-in sheet). */
  displayTitle?: boolean;
};

/** Bottom sheet used by every Cities flow (phone first; centred card on wide screens). */
export function CitySheet({ title, eyebrow, lead, subtitle, busy = false, onClose, children, displayTitle }: CitySheetProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useBodyScrollLock(true);
  useDialogFocusManager({ open: true, containerRef: ref, onClose: busy ? undefined : onClose });

  return (
    <div
      className="cities-sheet__overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="cities-sheet" ref={ref} tabIndex={-1}>
        <span className="cities-sheet__grip" aria-hidden />
        <header className="cities-sheet__head">
          {lead}
          <div className="cities-sheet__head-copy">
            {eyebrow ? <p className="cities__eyebrow">{eyebrow}</p> : null}
            <h2 id={titleId} className={displayTitle ? "cities-sheet__title cities-sheet__title--display" : "cities-sheet__title"}>
              {title}
            </h2>
            {subtitle ? <p className="cities-sheet__subtitle">{subtitle}</p> : null}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const text = parts.length === 0 ? "?" : `${parts[0]![0] ?? ""}${parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : ""}`;
  return (
    <span className="cities__avatar" aria-hidden>
      {text.toUpperCase()}
    </span>
  );
}
