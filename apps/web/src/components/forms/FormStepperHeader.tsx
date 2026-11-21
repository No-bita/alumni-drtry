type FormStepperHeaderProps = {
  /** Step labels in order, e.g. ["Details", "Context", "Visibility", "Review"]. */
  steps: string[];
  /** Zero-based index of the current step. */
  current: number;
  ariaLabel?: string;
  className?: string;
};

/**
 * Numbered step header from the form design sheets. Pure presentation: the owning flow
 * decides what each step means and renders the body.
 */
export function FormStepperHeader({ steps, current, ariaLabel = "Form steps", className = "" }: FormStepperHeaderProps) {
  return (
    <ol className={`form-stepper${className ? ` ${className}` : ""}`} aria-label={ariaLabel}>
      {steps.map((label, index) => {
        const state = index < current ? "done" : index === current ? "current" : "todo";
        return (
          <li
            key={label}
            className={`form-stepper__step form-stepper__step--${state}`}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className="form-stepper__marker" aria-hidden="true">
              {state === "done" ? (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="m2 5.5 2.5 2.5L9 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                index + 1
              )}
            </span>
            <span className="form-stepper__label">{label}</span>
            {index < steps.length - 1 ? <span className="form-stepper__connector" aria-hidden="true" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
