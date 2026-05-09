import type { RefObject } from "react";
import type { BulletinUiCategory } from "./bulletinPostCardUtils";

/** Bulletin categories supported by the general post wizard (hiring uses its own compose path). */
export type BulletinGeneralCategory = BulletinUiCategory;

export type PostBulletinOpenOptions = {
  /** Initial category when the modal opens */
  category?: BulletinGeneralCategory;
};

export type PostBulletinFlowHandleShape = {
  open: (options?: PostBulletinOpenOptions) => void;
  close: () => void;
};

/**
 * Returns a stable callback for buttons or routes — keeps wiring decoupled from the dialog implementation.
 *
 * @example
 * const ref = useRef<PostBulletinFlowHandle>(null);
 * <button type="button" onClick={bulletinFlowOpener(ref)}>Post</button>
 * <button type="button" onClick={bulletinFlowOpener(ref, { category: 'mentorship' })}>Offer mentorship</button>
 */
export function bulletinFlowOpener(
  ref: RefObject<PostBulletinFlowHandleShape | null>,
  preset?: PostBulletinOpenOptions
): () => void {
  return () => {
    ref.current?.open(preset);
  };
}
