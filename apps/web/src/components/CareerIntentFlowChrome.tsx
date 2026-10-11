import type { ReactNode } from "react";
import "../styles/career-hiring-flow-scroll.css";

export type CareerIntentFlowStep = "compose" | "preview";

export type CareerIntentFlowChromeProps = {
  ariaLabel: string;
  onRequestClose: () => void;
  step: CareerIntentFlowStep;
  /** Step 1 label under the indicator (default: Compose). */
  composeStepLabel?: string;
  /** Step 2 label under the indicator (default: Preview). */
  previewStepLabel?: string;
  /** `aria-label` on the steps row for screen readers. */
  stepsAriaLabel?: string;
  /** Accessible label for the dialog close control. */
  closeAriaLabel?: string;
  children: ReactNode;
};

/**
 * Shared overlay, dialog frame, close control, and two-step indicator for Career intent flows
 * (hiring compose/preview and general bulletin compose/preview).
 */
export function CareerIntentFlowChrome({
  ariaLabel,
  onRequestClose,
  step,
  composeStepLabel = "Compose",
  previewStepLabel = "Preview",
  stepsAriaLabel = "Flow steps",
  closeAriaLabel = "Close",
  children,
}: CareerIntentFlowChromeProps) {
  return (
    <div className="career-hiring-flow__overlay" role="presentation" onClick={onRequestClose}>
      <section
        className="career-hiring-flow__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="career-hiring-flow__head">
          <div className="career-hiring-flow__head-title">
            <div>
              <h2 className="visually-hidden">{ariaLabel}</h2>
            </div>
          </div>
          <button type="button" className="career-hiring-flow__close" onClick={onRequestClose} aria-label={closeAriaLabel}>
            ×
          </button>
        </header>
        <div className="career-hiring-flow__steps career-hiring-flow__steps--two" aria-label={stepsAriaLabel}>
          <span className={step === "compose" ? "is-active" : "is-done"}>
            <b>{step === "preview" ? "✓" : "1"}</b>
            <small>{composeStepLabel}</small>
          </span>
          <span className={step === "preview" ? "is-active" : ""}>
            <b>2</b>
            <small>{previewStepLabel}</small>
          </span>
        </div>
        {children}
      </section>
    </div>
  );
}
