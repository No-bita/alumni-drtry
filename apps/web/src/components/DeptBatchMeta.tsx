import type { ElementType, ReactNode } from "react";
import { IconGradCap, IconHome } from "./HomeIcons";
import { formatBatchYearShort } from "../lib/bulletinPostCardUtils";

export type DeptBatchMetaProps = {
  departmentCode?: string | null;
  batchYear?: number | null;
  /** Extra segment after dept / cohort, e.g. relative time */
  trailing?: string | null;
  className?: string;
  /** Root element — use `p` when replacing block subtitles */
  as?: ElementType;
};

/**
 * Standard alum context line: house icon + department code; graduation cap + cohort shorthand ('YY).
 * No code ⇒ dept segment omitted.
 */
export function DeptBatchMeta({
  departmentCode,
  batchYear,
  trailing,
  className,
  as: Tag = "span",
}: DeptBatchMetaProps): ReactNode {
  const deptLabel = departmentCode?.trim().toUpperCase() || "";
  const hasDept = Boolean(deptLabel);
  const y = batchYear;
  const hasBatch = typeof y === "number" && Number.isFinite(y);
  const trail = trailing?.trim() ?? "";
  const hasTrail = Boolean(trail);

  if (!hasDept && !hasBatch && !hasTrail) return null;

  const nodes: ReactNode[] = [];
  if (hasDept) {
    nodes.push(
      <span key="dept" className="dept-batch-meta__dept">
        <IconHome className="dept-batch-meta__house-icon" aria-hidden />
        <span className="visually-hidden">Department </span>
        {deptLabel}
      </span>,
    );
  }
  if (hasBatch) {
    const yearInt = Math.trunc(y as number);
    const batchShort = formatBatchYearShort(y as number);
    if (nodes.length > 0) {
      nodes.push(
        <span key="sep-b" className="dept-batch-meta__sep" aria-hidden>
          <span className="dept-batch-meta__sep-dot" />
        </span>,
      );
    }
    nodes.push(
      <span key="batch" className="dept-batch-meta__batch">
        <IconGradCap className="dept-batch-meta__cap-icon" aria-hidden />
        <span className="visually-hidden">Class of {yearInt}. </span>
        <span aria-hidden>{batchShort}</span>
      </span>,
    );
  }
  if (hasTrail) {
    if (nodes.length > 0) {
      nodes.push(
        <span key="sep-t" className="dept-batch-meta__sep" aria-hidden>
          <span className="dept-batch-meta__sep-dot" />
        </span>,
      );
    }
    nodes.push(
      <span key="trail" className="dept-batch-meta__trail">
        {trail}
      </span>,
    );
  }

  return <Tag className={["dept-batch-meta", className].filter(Boolean).join(" ")}>{nodes}</Tag>;
}
