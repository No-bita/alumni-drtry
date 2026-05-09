import { createPortal } from "react-dom";
import type { CSSProperties, Ref } from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

type BulletinOwnPostMenuProps = {
  /** Opens the confirmation flow (parent-owned dialog). */
  onRequestDelete: () => void;
  deleteDisabled?: boolean;
  /**
   * Escape overflow clipping (bulletin vertical scroll + home horizontal carousel).
   */
  detachDropdown?: boolean;
};

function DeleteMenuDropdown({
  menuId,
  buttonId,
  deleteDisabled,
  onMenuDelete,
  className,
  style,
  panelRef,
}: {
  menuId: string;
  buttonId: string;
  deleteDisabled?: boolean;
  onMenuDelete: () => void;
  className?: string;
  style?: CSSProperties;
  panelRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={panelRef} id={menuId} className={className ?? "bulletin-own-menu__dropdown"} style={style} role="menu" aria-labelledby={buttonId}>
      <button
        type="button"
        role="menuitem"
        className="bulletin-own-menu__item bulletin-own-menu__item--danger"
        disabled={deleteDisabled}
        onClick={onMenuDelete}
      >
        Delete
      </button>
    </div>
  );
}

/**
 * Kebab trigger for bulletin cards (own posts): visually hidden until card hover unless open (pointer hover only).
 */
export function BulletinOwnPostMenu({
  onRequestDelete,
  deleteDisabled,
  detachDropdown = false,
}: BulletinOwnPostMenuProps) {
  const [open, setOpen] = useState(false);
  const [dropStyle, setDropStyle] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inlinePanelRef = useRef<HTMLDivElement>(null);
  const floatedPanelRef = useRef<HTMLDivElement>(null);
  const buttonId = useId();
  const menuId = useId();

  const close = useCallback(() => setOpen(false), []);

  const onMenuDelete = useCallback(() => {
    close();
    onRequestDelete();
  }, [close, onRequestDelete]);

  useLayoutEffect(() => {
    if (!open || !detachDropdown || !triggerRef.current) return;
    const anchor = triggerRef.current;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const minW = 140;
      const left = Math.max(10, Math.min(window.innerWidth - minW - 10, r.right - minW));
      setDropStyle({
        position: "fixed",
        top: `${r.bottom + 5}px`,
        left: `${left}px`,
        minWidth: `${minW}px`,
        zIndex: 2600,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, detachDropdown]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (floatedPanelRef.current?.contains(target)) return;
      if (inlinePanelRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const floatingPanel =
    open && detachDropdown && dropStyle ? (
      createPortal(
        <DeleteMenuDropdown
          menuId={menuId}
          buttonId={buttonId}
          deleteDisabled={deleteDisabled}
          onMenuDelete={onMenuDelete}
          className="bulletin-own-menu__dropdown bulletin-own-menu__dropdown--floating"
          style={dropStyle}
          panelRef={floatedPanelRef}
        />,
        document.body
      )
    ) : null;

  const inlinePanel =
    !detachDropdown && open ? (
      <DeleteMenuDropdown
        menuId={menuId}
        buttonId={buttonId}
        deleteDisabled={deleteDisabled}
        onMenuDelete={onMenuDelete}
        panelRef={inlinePanelRef}
      />
    ) : null;

  return (
    <div ref={rootRef} className={`bulletin-own-menu${open ? " bulletin-own-menu--open" : ""}`}>
      <button
        id={buttonId}
        ref={triggerRef}
        type="button"
        className="bulletin-own-menu__trigger"
        aria-label="Post actions"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        disabled={Boolean(deleteDisabled)}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="currentColor"
          className="bulletin-own-menu__dots"
          aria-hidden
        >
          <circle cx="9" cy="3.75" r="1.65" />
          <circle cx="9" cy="9" r="1.65" />
          <circle cx="9" cy="14.25" r="1.65" />
        </svg>
      </button>
      {floatingPanel}
      {inlinePanel}
    </div>
  );
}
