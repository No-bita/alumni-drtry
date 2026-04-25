import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

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

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
};

export function Textarea({ label, id, className = "", ...props }: TextareaProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="ui-label input-field__label">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className="input input--textarea"
        {...props}
      />
    </div>
  );
}
