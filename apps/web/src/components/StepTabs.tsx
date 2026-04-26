export type Step = { id: number; name: string; done?: boolean };

type StepTabsProps = {
  steps: Step[];
  current: number;
  className?: string;
  onStepClick?: (stepId: number) => void;
};

export function StepTabs({ steps, current, className, onStepClick }: StepTabsProps) {
  return (
    <div className={["step-tabs", className].filter(Boolean).join(" ")}>
      {steps.map((step) => {
        const isActive = step.id === current;
        const isDone = step.done ?? step.id < current;
        const canNavigate = step.id < current;
        return (
          <button
            type="button"
            key={step.id}
            className={`step-tab ${isActive ? "step-tab--active" : ""} ${isDone ? "step-tab--done" : ""} ${
              canNavigate ? "step-tab--clickable" : ""
            }`}
            onClick={() => {
              if (!canNavigate) return;
              onStepClick?.(step.id);
            }}
            disabled={!canNavigate}
            aria-current={isActive ? "step" : undefined}
          >
            <span className="step-tab__dot">
              {isDone && !isActive ? "✓" : step.id}
            </span>
            <span className="step-tab__name">{step.name}</span>
          </button>
        );
      })}
    </div>
  );
}
