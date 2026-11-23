import { useCallback, useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useDialogFocusManager } from "../../hooks/useDialogFocusManager";
import { Button } from "../Button";
import "../../styles/profile-page.css";

type Props = {
  title: string;
  /** One line under the title. */
  description?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  /** Omit for a sheet whose changes save as they happen (it shows "Done" only). */
  onSave?: () => void | Promise<void>;
  saving?: boolean;
  error?: string | null;
  saveLabel?: string;
};

/**
 * Edits one profile section: a panel from the right on desktop, from the bottom on phones.
 * Escape, the close button and the backdrop all cancel; nothing is saved until Save.
 */
export function ProfileSheet({ title, description, children, onClose, onSave, saving = false, error = null, saveLabel = "Save" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    closeRef.current = saving ? null : onClose;
  }, [saving, onClose]);
  // Stable, so the focus trap isn't re-run (and focus doesn't jump) whenever the page re-renders.
  // Escape closes only the top-most dialog: a sheet opened inside this one (e.g. the coffee limit) goes first.
  const escape = useCallback(() => {
    const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
    if (dialogs[dialogs.length - 1] !== ref.current) return;
    closeRef.current?.();
  }, []);
  useBodyScrollLock(true);
  useDialogFocusManager({ open: true, containerRef: ref, onClose: escape });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (onSave && !saving) void onSave();
  };

  return (
    <div
      className="pp-sheet__overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="pp-sheet" tabIndex={-1}>
        <form className="pp-sheet__form" onSubmit={submit} noValidate>
          <header className="pp-sheet__head">
            <div>
              <h2 id={titleId} className="pp-sheet__title">
                {title}
              </h2>
              {description ? <p className="pp-sheet__desc">{description}</p> : null}
            </div>
            <button type="button" className="pp-sheet__close" aria-label="Close" onClick={onClose} disabled={saving}>
              ×
            </button>
          </header>
          <div className="pp-sheet__body">{children}</div>
          {error ? (
            <p className="pp-sheet__error" role="alert">
              {error}
            </p>
          ) : null}
          <footer className="pp-sheet__foot">
            {onSave ? (
              <>
                <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? "Saving…" : saveLabel}
                </Button>
              </>
            ) : (
              <Button type="button" variant="primary" onClick={onClose}>
                Done
              </Button>
            )}
          </footer>
        </form>
      </div>
    </div>
  );
}
