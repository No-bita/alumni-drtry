import { type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

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
  const inputId = id ?? `input-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="ui-label" style={{ display: "block", marginBottom: 4 }}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`input ${prefilled ? "input--prefilled" : ""}`.trim()}
        {...props}
      />
      {note && (
        <p className="input-note" style={{ marginTop: 4 }}>
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
  const inputId = id ?? `textarea-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="ui-label" style={{ display: "block", marginBottom: 4 }}>
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className="input"
        style={{ minHeight: 100, resize: "vertical" }}
        {...props}
      />
    </div>
  );
}
