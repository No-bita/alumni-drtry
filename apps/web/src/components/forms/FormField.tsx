import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

type FormFieldProps = {
  label: string;
  /** Marks the field required with a visible asterisk and aria-required on the control. */
  required?: boolean;
  /** Calm helper text shown under the control when there is no error. */
  help?: string;
  /** Error text. Replaces the helper and marks the control invalid. */
  error?: string | null;
  className?: string;
  /**
   * Exactly one control element (input, select, textarea or a component accepting
   * id/aria-* props). FormField wires id, aria-describedby, aria-invalid and aria-required.
   */
  children: ReactElement;
  /**
   * Use when the actual control sits inside a wrapper (e.g. textarea with an inline
   * counter): the label's htmlFor points at this control id instead of the child element.
   */
  controlId?: string;
};

/**
 * Shared field wrapper from the form design sheets: label on top, control, then helper or
 * error text. Owns the id/aria wiring so every form gets the same accessible structure.
 */
export function FormField({ label, required = false, help, error, className = "", children, controlId }: FormFieldProps) {
  const generatedId = useId();
  const helpId = `${generatedId}-help`;
  const errorId = `${generatedId}-error`;
  const describedBy = error ? errorId : help ? helpId : undefined;

  let control: ReactNode = children;
  if (isValidElement(children)) {
    const childProps = children.props as { id?: string; "aria-describedby"?: string };
    const mergedDescribedBy = [childProps["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined;
    control = cloneElement(children, {
      id: childProps.id ?? generatedId,
      "aria-describedby": mergedDescribedBy,
      "aria-invalid": error ? true : undefined,
      "aria-required": required ? true : undefined,
    } as Partial<typeof children.props>);
  }

  const labelFor = controlId ?? (isValidElement(children) ? ((children.props as { id?: string }).id ?? generatedId) : generatedId);

  return (
    <div className={`form-field${error ? " form-field--error" : ""}${className ? ` ${className}` : ""}`}>
      <label className={`form-field__label${required ? " form-field__label--required" : ""}`} htmlFor={labelFor}>
        {label}
      </label>
      {control}
      {error ? (
        <p className="form-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : help ? (
        <p className="form-field__help" id={helpId}>
          {help}
        </p>
      ) : null}
    </div>
  );
}
