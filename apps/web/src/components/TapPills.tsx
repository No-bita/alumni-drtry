import { useId } from "react";
import "../styles/broker.css";

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  /** Visible question above the pills (also the group's name). */
  label: string;
  options: ReadonlyArray<Option<T>>;
  value: T | null;
  onChange: (value: T) => void;
  /** Optional text under the label. */
  hint?: string;
  error?: string;
};

/** One question answered by a tap: a single-choice row of pills (radio semantics). */
export function TapPills<T extends string>({ label, options, value, onChange, hint, error }: Props<T>) {
  const labelId = useId();
  const hintId = useId();
  return (
    <div className="tap-pills">
      <p id={labelId} className="tap-pills__label">
        {label}
      </p>
      {hint ? (
        <p id={hintId} className="tap-pills__hint">
          {hint}
        </p>
      ) : null}
      <div role="radiogroup" aria-labelledby={labelId} aria-describedby={hint ? hintId : undefined} className="tap-pills__row">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={`tap-pills__pill${value === o.value ? " tap-pills__pill--on" : ""}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {error ? (
        <p className="tap-pills__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
