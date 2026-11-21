import { useRef, useState } from "react";
import { Button } from "../Button";
import { ProfileExperienceFields } from "./ProfileExperienceFields";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useDialogFocusManager } from "../../hooks/useDialogFocusManager";
import {
  validateOccupationDraft,
  type OccupationDraft,
} from "../../lib/occupationProfileEdit";

type ProfileExperienceFormDialogProps = {
  open: boolean;
  draft: OccupationDraft | null;
  mode: "add" | "edit";
  onClose: () => void;
  onConfirm: (draft: OccupationDraft) => void;
};

export function ProfileExperienceFormDialog({
  open,
  draft,
  mode,
  onClose,
  onConfirm,
}: ProfileExperienceFormDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [localDraft, setLocalDraft] = useState<OccupationDraft | null>(() => open && draft ? { ...draft } : null);
  const [fieldErrors, setFieldErrors] = useState<{ roleTitle?: string; endMonth?: string }>({});

  const [source, setSource] = useState({ open, draft });
  if (source.open !== open || source.draft !== draft) {
    setSource({ open, draft });
    setLocalDraft(open && draft ? { ...draft } : null);
    setFieldErrors({});
  }

  useBodyScrollLock(open);
  useDialogFocusManager({
    open,
    containerRef: dialogRef,
    onClose,
  });

  if (!open || !localDraft) return null;

  const title = mode === "add" ? "Add experience" : "Edit experience";
  const confirmLabel = mode === "add" ? "Add to profile" : "Done";

  const handleConfirm = () => {
    const validation = validateOccupationDraft(localDraft);
    if (validation) {
      // Show the message on the field it belongs to (FormField error state).
      if (validation.startsWith("Role title")) {
        setFieldErrors({ roleTitle: validation });
      } else if (validation.startsWith("End date")) {
        setFieldErrors({ endMonth: validation });
      } else {
        setFieldErrors({ roleTitle: validation });
      }
      return;
    }
    onConfirm(localDraft);
    onClose();
  };

  return (
    <div
      className="profile-page__exp-dialog-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-exp-dialog-title"
        className="profile-page__exp-dialog"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="profile-page__exp-dialog-head">
          <h2 id="profile-exp-dialog-title" className="profile-page__exp-dialog-title">
            {title}
          </h2>
          <button
            type="button"
            className="profile-page__exp-dialog-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <p className="profile-page__exp-dialog-desc">
          Add a past or current role. Save your profile when you are finished editing.
        </p>
        <ProfileExperienceFields
          draft={localDraft}
          errors={fieldErrors}
          onDraftChange={(patch) => {
            setLocalDraft((prev) => {
              if (!prev) return prev;
              let next = { ...prev, ...patch };
              if (patch.isCurrent === true) {
                next = { ...next, endMonth: "" };
              }
              return next;
            });
            // Clear only the errors whose fields were just edited.
            setFieldErrors((prev) => {
              const next = { ...prev };
              if ("roleTitle" in patch) delete next.roleTitle;
              if ("endMonth" in patch || "startMonth" in patch || "isCurrent" in patch) delete next.endMonth;
              return next;
            });
          }}
        />
        <div className="profile-page__exp-dialog-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
