import type { ReactNode } from "react";
import { Button } from "../Button";

type FormActionsProps = {
  /** Left-side quiet action (back a step, or cancel a dialog). */
  secondary?: { label: string; onClick: () => void; disabled?: boolean };
  /** Right-side main action. */
  primary: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean };
  /** Optional extra actions rendered between secondary and primary (e.g. Save as draft). */
  children?: ReactNode;
  className?: string;
};

/**
 * Consistent action row from the form design sheets: quiet action on the left,
 * primary (and any extras like Save as draft) on the right.
 */
export function FormActions({ secondary, primary, children, className = "" }: FormActionsProps) {
  return (
    <div className={`form-actions${className ? ` ${className}` : ""}`}>
      <div className="form-actions__left">
        {secondary ? (
          <Button variant="back" onClick={secondary.onClick} disabled={secondary.disabled}>
            {secondary.label}
          </Button>
        ) : null}
      </div>
      <div className="form-actions__right">
        {children}
        <Button variant="primary" onClick={primary.onClick} disabled={primary.disabled || primary.busy}>
          {primary.busy ? "Saving…" : primary.label}
        </Button>
      </div>
    </div>
  );
}
