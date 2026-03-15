export type Step = { id: number; name: string; done?: boolean };

type StepTabsProps = {
  steps: Step[];
  current: number;
};

export function StepTabs({ steps, current }: StepTabsProps) {
  return (
    <div className="step-tabs">
      {steps.map((step) => {
        const isActive = step.id === current;
        const isDone = step.done ?? step.id < current;
        return (
          <div
            key={step.id}
            className={`step-tab ${isActive ? "step-tab--active" : ""} ${isDone ? "step-tab--done" : ""}`}
          >
            <span className="step-tab__dot">
              {isDone && !isActive ? "✓" : step.id + 1}
            </span>
            <span className="step-tab__name">{step.name}</span>
          </div>
        );
      })}
    </div>
  );
}
