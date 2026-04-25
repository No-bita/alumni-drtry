import { type ReactNode } from "react";

type InlineStateMessageTone = "muted" | "error" | "info";

type InlineStateMessageProps = {
  children: ReactNode;
  tone?: InlineStateMessageTone;
  className?: string;
  role?: "status" | "alert";
};

export function InlineStateMessage({
  children,
  tone = "muted",
  className = "",
  role = "status",
}: InlineStateMessageProps) {
  const cls = `inline-state-message inline-state-message--${tone}${className ? ` ${className}` : ""}`;
  return (
    <p className={cls} role={role}>
      {children}
    </p>
  );
}
