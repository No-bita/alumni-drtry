import { useId, type InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  prefilled?: boolean;
  note?: string;
  label?: string;
};

export function Input({
  prefilled,
  note,
  label,
  id,
  className = "",
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="ui-label input-field__label">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`input ${prefilled ? "input--prefilled" : ""}`.trim()}
        {...props}
      />
      {note && (
        <p className="input-note">
          → {note}
        </p>
      )}
    </div>
  );
}

