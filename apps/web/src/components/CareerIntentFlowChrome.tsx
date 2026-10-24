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
  hideSteps?: boolean;
  dialogClassName?: string;
  title?: string;
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
  hideSteps = false,
  dialogClassName,
  title,
  children,
}: CareerIntentFlowChromeProps) {
  return (
    <div className="career-hiring-flow__overlay" role="presentation" onClick={onRequestClose}>
      <section
        className={["career-hiring-flow__dialog", dialogClassName].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="career-hiring-flow__head">
          <div className="career-hiring-flow__head-title">
            <div>
              {title ? <h2 className="career-hiring-flow__title">{title}</h2> : <h2 className="visually-hidden">{ariaLabel}</h2>}
            </div>
          </div>
          <button type="button" className="career-hiring-flow__close" onClick={onRequestClose} aria-label={closeAriaLabel}>
            ×
          </button>
        </header>
        {!hideSteps ? <div className="career-hiring-flow__steps career-hiring-flow__steps--two" aria-label={stepsAriaLabel}>
          <span className={step === "compose" ? "is-active" : "is-done"}>
            <b>{step === "preview" ? "✓" : "1"}</b>
            <small>{composeStepLabel}</small>
          </span>
          <span className={step === "preview" ? "is-active" : ""}>
            <b>2</b>
            <small>{previewStepLabel}</small>
          </span>
        </div> : null}
        {children}
      </section>
    </div>
  );
}
