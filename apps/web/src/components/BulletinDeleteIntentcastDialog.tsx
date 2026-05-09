import type { RefObject } from "react";
import { Button } from "./Button";

export type BulletinDeleteIntentcastDialogProps = {
  open: boolean;
  deleteDialogRef: RefObject<HTMLDivElement | null>;
  submitting: boolean;
  onRequestClose: () => void;
  onConfirm: () => void;
};

/** Shared remove-post confirmation for bulletin/intentcasts. */
export function BulletinDeleteIntentcastDialog({
  open,
  deleteDialogRef,
  submitting,
  onRequestClose,
  onConfirm,
}: BulletinDeleteIntentcastDialogProps) {
  if (!open) return null;
  return (
    <div
      className="home-dashboard__bulletin-delete-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onRequestClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulletin-delete-dialog-title"
        className="home-dashboard__bulletin-delete-dialog"
        ref={deleteDialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="bulletin-delete-dialog-title" className="home-dashboard__bulletin-delete-dialog-title">
          Are you sure you want to delete this post?
        </h2>
        <div className="home-dashboard__bulletin-delete-dialog-actions">
          <Button type="button" variant="secondary" onClick={onRequestClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={onConfirm} disabled={submitting}>
            {submitting ? "Removing…" : "Remove post"}
          </Button>
        </div>
      </div>
    </div>
  );
}
