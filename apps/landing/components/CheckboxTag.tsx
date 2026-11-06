import { cx } from "../lib/cx.ts";

type CheckboxTagProps = {
  label: string;
  className?: string;
};

/** Small square box with a blue tick, then a mono label. Display only, not a form control. */
export function CheckboxTag({ label, className }: CheckboxTagProps) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-mono text-xs font-medium text-ink", className)}>
      <span
        aria-hidden="true"
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center border-2 border-ink bg-card"
      >
        <svg viewBox="0 0 12 12" width="10" height="10" className="text-pen-blue" focusable="false">
          <path d="M1.5 6.5 4.5 9.5 10.5 2.5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </span>
      <span>{label}</span>
    </span>
  );
}
