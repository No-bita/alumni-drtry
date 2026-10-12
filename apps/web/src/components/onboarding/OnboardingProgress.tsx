import "./OnboardingProgress.css";

type OnboardingProgressProps = {
  /** 1-based position across every onboarding question (not reset between sections). */
  current: number;
  total: number;
};

export function OnboardingProgress({ current, total }: OnboardingProgressProps) {
  const safeTotal = Math.max(1, total);
  const safeCurrent = Math.min(Math.max(1, current), safeTotal);
  const pct = Math.round((safeCurrent / safeTotal) * 100);

  return (
    <div className="onboarding-progress">
      <p className="onboarding-progress__label">
        Step {safeCurrent} of {safeTotal}
      </p>
      <div
        className="onboarding-progress__track"
        role="progressbar"
        aria-label="Onboarding progress"
        aria-valuemin={1}
        aria-valuemax={safeTotal}
        aria-valuenow={safeCurrent}
        aria-valuetext={`Step ${safeCurrent} of ${safeTotal}`}
      >
        <span className="onboarding-progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
