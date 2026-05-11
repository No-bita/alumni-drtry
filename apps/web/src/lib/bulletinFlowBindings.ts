import type { RefObject } from "react";
import type { BulletinUiCategory } from "./bulletinPostCardUtils";

/** Bulletin categories supported by the general post wizard (hiring uses its own compose path). */
export type BulletinGeneralCategory = BulletinUiCategory;

/**
 * Careers hub panels: same Compose → Preview chrome.
 * - Find referrals → UI `careers` → API `mentorship`
 * - Can help → UI `guidance` → API `guidance` (hidden from Careers activity until enabled)
 */
export type CareersBulletinPreset = "referralSeeking" | "canHelp";

export type PostBulletinOpenOptions = {
  /** Initial category when the modal opens */
  category?: BulletinGeneralCategory;
  careersPreset?: CareersBulletinPreset;
  /** @deprecated Prefer {@link PostBulletinOpenOptions.careersPreset} `"referralSeeking"`. */
  referralSeeking?: boolean;
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
 * <button type="button" onClick={bulletinFlowOpener(ref, { category: 'guidance' })}>Offer guidance</button>
 */
export function bulletinFlowOpener(
  ref: RefObject<PostBulletinFlowHandleShape | null>,
  preset?: PostBulletinOpenOptions
): () => void {
  return () => {
    ref.current?.open(preset);
  };
}
