import { useRef } from "react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useDialogFocusManager } from "../hooks/useDialogFocusManager";

type UseBulletinDialogControllerParams = {
  composeDialogOpen: boolean;
  deleteDialogOpen: boolean;
  postSubmitting: boolean;
  deleteSubmittingLocked: boolean;
  onCloseCompose: () => void;
  onCloseDelete: () => void;
};

export function useBulletinDialogController({
  composeDialogOpen,
  deleteDialogOpen,
  postSubmitting,
  deleteSubmittingLocked,
  onCloseCompose,
  onCloseDelete,
}: UseBulletinDialogControllerParams) {
  const composeDialogRef = useRef<HTMLDivElement | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement | null>(null);

  useBodyScrollLock(composeDialogOpen || deleteDialogOpen);
  useDialogFocusManager({
    open: composeDialogOpen,
    containerRef: composeDialogRef,
    onClose: postSubmitting ? undefined : onCloseCompose,
  });
  useDialogFocusManager({
    open: deleteDialogOpen,
    containerRef: deleteDialogRef,
    onClose: deleteSubmittingLocked ? undefined : onCloseDelete,
  });

  return { composeDialogRef, deleteDialogRef };
}
