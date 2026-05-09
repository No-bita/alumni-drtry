import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "./Avatar";
import { DeptBatchMeta } from "./DeptBatchMeta";
import { DemoAuthorBadge } from "./DemoAuthorBadge";
import type { BulletinCardTone } from "../lib/bulletinPostCardUtils";
import { demoDisplayFullName } from "../lib/demoProfile";

export type BulletinPostCardVariant = "rail" | "stack";

export type BulletinPostCardProps = {
  variant: BulletinPostCardVariant;
  personProfileHref: string;
  authorFullName: string;
  departmentCode: string | null;
  batchYear?: number | null;
  /** Relative posted time — footer, right-aligned with primary action */
  postedRelative?: string | null;
  /** ISO timestamp for `<time dateTime>` when `postedRelative` is set */
  postedAtIso?: string | null;
  tone: BulletinCardTone;
  categoryBadgeLabel: string;
  title: string;
  summary: string | null;
  chips?: string[];
  /** Demo/test alumni author — shows a compact Demo badge next to the name. */
  authorIsDemo?: boolean;
  footer?: ReactNode;
  /** Own-post overflow (e.g. kebab menu) — top-right of header, with card hover affordance in CSS */
  ownerActions?: ReactNode;
  className?: string;
};

export function BulletinPostCard({
  variant,
  personProfileHref,
  authorFullName,
  departmentCode,
  batchYear,
  postedRelative,
  postedAtIso,
  tone,
  categoryBadgeLabel,
  title,
  summary,
  chips,
  authorIsDemo = false,
  footer,
  ownerActions,
  className,
}: BulletinPostCardProps) {
  const shellClass = variant === "rail" ? "bb-post-card bb-post-card--rail" : "bb-post-card bb-post-card--stack";
  const postChips = (chips ?? []).filter(Boolean).slice(0, 4);
  const displayAuthorName = demoDisplayFullName(authorFullName) || authorFullName.trim();

  /** Description only — hide when empty or duplicates the headline (after normalize). */
  const collapseWs = (s: string) => s.trim().replace(/\s+/g, " ");
  const description =
    summary && collapseWs(summary) !== collapseWs(title || "") ? summary.trim() : null;

  return (
    <article className={`${shellClass}${ownerActions ? " bb-post-card--has-owner-actions" : ""}${className ? ` ${className}` : ""}`}>
      <header className="bb-post-card__header">
        <Link to={personProfileHref} className="bb-post-card__person">
          <Avatar name={displayAuthorName} size="sm" tone="pastel" />
          <span className="bb-post-card__person-text">
            <span className="bb-post-card__name-row">
              <span className="bb-post-card__name">{displayAuthorName}</span>
              {authorIsDemo ? <DemoAuthorBadge /> : null}
            </span>
            <DeptBatchMeta
              className="bb-post-card__meta dept-batch-meta"
              departmentCode={departmentCode}
              batchYear={batchYear ?? null}
            />
          </span>
        </Link>
        <span
          className={`bb-post-card__category bb-post-card__category--${tone} bb-post-card__category--corner`}
        >
          {categoryBadgeLabel}
        </span>
        {ownerActions ? (
          <div className="bb-post-card__owner-actions bb-post-card__owner-actions--corner">{ownerActions}</div>
        ) : null}
      </header>
      <div className="bb-post-card__body">
        <h3 className="bb-post-card__title">{title}</h3>
        {description ? <p className="bb-post-card__summary">{description}</p> : null}
      </div>
      {postChips.length > 0 ? (
        <ul className="bb-post-card__tags" aria-label="Topics">
          {postChips.map((chip, i) => (
            <li key={`chip-${i}`} className="bb-post-card__tag">
              {chip}
            </li>
          ))}
        </ul>
      ) : null}
      {footer != null || postedRelative ? (
        <footer className="bb-post-card__footer">
          <div className="bb-post-card__footer-inner">
            {footer != null ? <div className="bb-post-card__footer-lead">{footer}</div> : null}
            {postedRelative ? (
              <time className="bb-post-card__posted-at" dateTime={postedAtIso ?? undefined}>
                {postedRelative}
              </time>
            ) : null}
          </div>
        </footer>
      ) : null}
    </article>
  );
}
