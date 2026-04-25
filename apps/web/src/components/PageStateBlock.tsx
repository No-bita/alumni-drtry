import { type ReactNode } from "react";
import { InlineStateMessage } from "./InlineStateMessage";

type PageStateBlockTone = "default" | "error";

type PageStateBlockProps = {
  title: string;
  description?: ReactNode;
  tone?: PageStateBlockTone;
  className?: string;
  children?: ReactNode;
};

export function PageStateBlock({
  title,
  description,
  tone = "default",
  className = "",
  children,
}: PageStateBlockProps) {
  const blockClass = `page-state-block${tone === "error" ? " page-state-block--error" : ""}${className ? ` ${className}` : ""}`;
  return (
    <div className={blockClass}>
      <p className="section-headline page-state-block__title">{title}</p>
      {description ? (
        <InlineStateMessage tone={tone === "error" ? "error" : "muted"} className="page-state-block__description">
          {description}
        </InlineStateMessage>
      ) : null}
      {children}
    </div>
  );
}
