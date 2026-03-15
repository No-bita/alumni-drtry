import { type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "skip" | "back";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: React.ReactNode;
};

export function Button({
  variant = "primary",
  type = "button",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const classNames = ["btn", `btn--${variant}`, className].filter(Boolean).join(" ");
  return (
    <button type={type} className={classNames} {...props}>
      {variant === "back" && (
        <span aria-hidden>←</span>
      )}
      {children}
    </button>
  );
}
