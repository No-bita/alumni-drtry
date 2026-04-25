import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBulletinDialogController } from "../src/components/useBulletinDialogController";

const { bodyScrollLockMock, dialogFocusManagerMock } = vi.hoisted(() => ({
  bodyScrollLockMock: vi.fn(),
  dialogFocusManagerMock: vi.fn(),
}));

vi.mock("../src/hooks/useBodyScrollLock", () => ({
  useBodyScrollLock: bodyScrollLockMock,
}));

vi.mock("../src/hooks/useDialogFocusManager", () => ({
  useDialogFocusManager: dialogFocusManagerMock,
}));

describe("useBulletinDialogController", () => {
  beforeEach(() => {
    bodyScrollLockMock.mockClear();
    dialogFocusManagerMock.mockClear();
  });

  it("locks scroll when either dialog is open", () => {
    renderHook(() =>
      useBulletinDialogController({
        composeDialogOpen: true,
        deleteDialogOpen: false,
        postSubmitting: false,
        deleteSubmittingLocked: false,
        onCloseCompose: vi.fn(),
        onCloseDelete: vi.fn(),
      })
    );

    expect(bodyScrollLockMock).toHaveBeenCalledWith(true);
  });

  it("suppresses onClose handlers while submit locks are active", () => {
    const onCloseCompose = vi.fn();
    const onCloseDelete = vi.fn();

    renderHook(() =>
      useBulletinDialogController({
        composeDialogOpen: true,
        deleteDialogOpen: true,
        postSubmitting: true,
        deleteSubmittingLocked: true,
        onCloseCompose,
        onCloseDelete,
      })
    );

    const firstCall = dialogFocusManagerMock.mock.calls[0]?.[0] as { onClose?: () => void };
    const secondCall = dialogFocusManagerMock.mock.calls[1]?.[0] as { onClose?: () => void };
    expect(firstCall?.onClose).toBeUndefined();
    expect(secondCall?.onClose).toBeUndefined();
  });
});
