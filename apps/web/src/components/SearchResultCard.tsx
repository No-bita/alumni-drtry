import { Link } from "react-router-dom";
import { Avatar } from "./Avatar";
import type { SearchProfileView } from "../api/client";
import { DeptBatchMeta } from "./DeptBatchMeta";

type SearchResultCardProps = {
  profile: SearchProfileView;
  style?: React.CSSProperties;
};

export function SearchResultCard({ profile, style }: SearchResultCardProps) {
  const roleLabel =
    profile.headlineRoleTitle && profile.headlineOrganizationName
      ? `${profile.headlineRoleTitle} @ ${profile.headlineOrganizationName}`
      : profile.headlineRoleTitle ?? "—";
  const codeRaw = profile.departmentCode;
  const deptCode = codeRaw?.trim() ? codeRaw : null;
  const batchYr = profile.batchYear ?? null;
  const degree = profile.degreeName ?? profile.degreeCode;
  const hasDeptBatch = Boolean(
    deptCode || (typeof batchYr === "number" && Number.isFinite(batchYr)),
  );
  const rawFullName = (profile.fullName ?? "").trim();
  const displayName = (profile.fullName ?? "").trim() || rawFullName;

  return (
    <Link
      to={`/profiles/${profile.id}`}
      className="card-search fade-up"
      style={style}
    >
      <div className="card-search__top">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <Avatar name={displayName} size="md" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="card-headline" style={{ margin: 0, fontSize: 20 }}>
              {displayName}
            </h3>
            <p className="ui-body" style={{ margin: 0, color: "var(--ink-muted)", fontSize: 13 }}>
              {roleLabel}
            </p>
            <span className="small-note" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
              {hasDeptBatch ? (
                <DeptBatchMeta className="dept-batch-meta" departmentCode={deptCode} batchYear={batchYr} />
              ) : null}
              {degree ? (
                <>
                  {hasDeptBatch ? (
                    <span className="dept-batch-meta__sep" aria-hidden>
                      ·
                    </span>
                  ) : null}
                  <span>{degree}</span>
                </>
              ) : null}
            </span>
          </div>
        </div>
        {/* {profile.bio?.trim() ? (
          <p className="card-search__bio">{profile.bio.trim()}</p>
        ) : null} */}
      </div>
      <div className="card-search__bottom">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {profile.headlineRoleTitle && (
            <span className="chip chip--sm" style={{ pointerEvents: "none" }}>
              {profile.headlineRoleTitle}
            </span>
          )}
        </div>
        <span className="reach-out-text ui-label" style={{ color: "var(--ochre)" }}>
          Reach out →
        </span>
      </div>
    </Link>
  );
}
