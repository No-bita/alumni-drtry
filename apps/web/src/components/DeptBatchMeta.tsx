import type { ElementType, ReactNode } from "react";
import { formatBatchYearShort } from "../lib/bulletinPostCardUtils";
import { GraduationCapIcon } from "./GraduationCapIcon";

export type DeptBatchMetaProps = {
  departmentCode?: string | null;
  batchYear?: number | null;
  /** Extra segment after dept / cohort, e.g. relative time */
  trailing?: string | null;
  className?: string;
  /** Root element — use `p` when replacing block subtitles */
  as?: ElementType;
};

function formatDeptBatchVisibleLabel(departmentCode: string, batchYear: number | null): string {
  const dept = departmentCode.trim().toUpperCase();
  const batch =
    typeof batchYear === "number" && Number.isFinite(batchYear) ? formatBatchYearShort(batchYear) : "";
  if (dept && batch) return `${dept} ${batch}`;
  if (dept) return dept;
  return batch;
}

/**
 * Standard alum context line: graduation cap + department and cohort (e.g. CSE '21).
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
  if (hasDept || hasBatch) {
    const visibleLabel = formatDeptBatchVisibleLabel(deptLabel, hasBatch ? (y as number) : null);
    const yearInt = hasBatch ? Math.trunc(y as number) : null;
    nodes.push(
      <span key="education" className="dept-batch-meta__education">
        <GraduationCapIcon className="dept-batch-meta__cap-icon" />
        <span className="visually-hidden">
          {hasDept ? `Department ${deptLabel}. ` : ""}
          {hasBatch ? `Class of ${yearInt}. ` : ""}
        </span>
        <span aria-hidden>{visibleLabel}</span>
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
