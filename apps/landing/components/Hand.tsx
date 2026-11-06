import type { ElementType, ReactNode } from "react";
import { cx } from "../lib/cx.ts";

type HandProps = {
  children: ReactNode;
  as?: ElementType;
  className?: string;
};

/**
 * Handwriting (Caveat 700, pen-blue). Only for "answers".
 * Never below 24px: text-2xl is 1.5rem. Larger sizes may be passed via className.
 */
export function Hand({ children, as: Tag = "span", className }: HandProps) {
  return <Tag className={cx("font-hand text-2xl font-bold text-pen-blue", className)}>{children}</Tag>;
}
