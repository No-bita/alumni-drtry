type ProgressBarProps = {
  value: number; // 0–1
};

export function ProgressBar({ value }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div className="progress-bar">
      <div
        className="progress-bar__fill"
        style={{ width: `${pct}%` }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}
