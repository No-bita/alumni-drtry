import type { ReactNode } from "react";
import { STAMP_ROTATION_MAX, STAMP_ROTATION_MIN } from "../lib/tokens.ts";
import { cx } from "../lib/cx.ts";

export function clampStampRotation(deg: number): number {
  return Math.min(STAMP_ROTATION_MAX, Math.max(STAMP_ROTATION_MIN, deg));
}

type StampProps = {
  children: ReactNode;
  /** Degrees. Clamped to the spec range (-8 to -4). */
  rotate?: number;
  className?: string;
};

/** Rubber stamp: 3px double stamp-red border, uppercase condensed text, slightly transparent. */
export function Stamp({ children, rotate = -6, className }: StampProps) {
  return (
    <span
      data-stamp
      className={cx(
        "inline-block border-[3px] border-double border-stamp-red px-3 py-1",
        "font-display text-lg font-bold uppercase leading-tight tracking-wide text-stamp-red opacity-90",
        className,
      )}
      style={{ transform: `rotate(${clampStampRotation(rotate)}deg)` }}
    >
      {children}
    </span>
  );
}
