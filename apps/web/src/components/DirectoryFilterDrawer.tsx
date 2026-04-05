import { useEffect, useId, useRef } from "react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

type DirectoryFilterDrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};

export function DirectoryFilterDrawer({ open, onClose, title, children }: DirectoryFilterDrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("button, [href], select, input")?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="directory-drawer__backdrop" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        className="directory-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="directory-drawer__header">
          <h2 id={titleId} className="directory-drawer__title">
            {title}
          </h2>
          <button type="button" className="directory-drawer__close" onClick={onClose} aria-label="Close filters">
            ×
          </button>
        </header>
        <div className="directory-drawer__body">{children}</div>
      </div>
    </>
  );
}
