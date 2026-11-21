import type { ReactNode } from "react";

type SectionCardListProps = {
  children: ReactNode;
  className?: string;
};

/** Vertical stack of section rows (the sheets' "Sectioned Card Form" body). */
export function SectionCardList({ children, className = "" }: SectionCardListProps) {
  return <div className={`section-cards${className ? ` ${className}` : ""}`}>{children}</div>;
}

type SectionCardRowProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  /** Completion hint shown as a small status word on the right. */
  status?: "complete" | "incomplete";
  onClick?: () => void;
  className?: string;
};

/**
 * One tappable section row: icon, title + description, optional status and a chevron.
 * Used for progressive profile/portfolio setup - each row opens its own editor.
 */
export function SectionCardRow({ title, description, icon, status, onClick, className = "" }: SectionCardRowProps) {
  return (
    <button
      type="button"
      className={`section-card-row${status === "complete" ? " section-card-row--complete" : ""}${className ? ` ${className}` : ""}`}
      onClick={onClick}
    >
      {icon ? <span className="section-card-row__icon" aria-hidden="true">{icon}</span> : null}
      <span className="section-card-row__text">
        <span className="section-card-row__title">{title}</span>
        {description ? <span className="section-card-row__description">{description}</span> : null}
      </span>
      {status ? (
        <span className={`section-card-row__status section-card-row__status--${status}`}>
          {status === "complete" ? "Added" : "Add"}
        </span>
      ) : null}
      <span className="section-card-row__chevron" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="m5 3 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}
