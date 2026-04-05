import { Link } from "react-router-dom";
import { Avatar } from "./Avatar";
import type { SearchProfileView } from "../api/client";

type SearchResultCardProps = {
  profile: SearchProfileView;
  style?: React.CSSProperties;
};

export function SearchResultCard({ profile, style }: SearchResultCardProps) {
  const roleLabel =
    profile.headlineRoleTitle && profile.headlineOrganizationName
      ? `${profile.headlineRoleTitle} at ${profile.headlineOrganizationName}`
      : profile.headlineRoleTitle ?? "—";
  const batch = (profile.batchYear ?? profile.parsedJoiningYear) ? String(profile.batchYear ?? profile.parsedJoiningYear) : "—";
  const dept =
    profile.departmentName ??
    profile.parsedDepartmentName ??
    profile.departmentCode ??
    profile.parsedDepartmentCode ??
    "—";
  const degree = profile.degreeName ?? profile.degreeCode;

  return (
    <Link
      to={`/profiles/${profile.id}`}
      className="card-search fade-up"
      style={style}
    >
      <div className="card-search__top">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <Avatar name={profile.fullName} size="md" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="card-headline" style={{ margin: 0, fontSize: 20 }}>
              {profile.fullName}
            </h3>
            <p className="ui-body" style={{ margin: 0, color: "var(--ink-muted)", fontSize: 13 }}>
              {roleLabel}
            </p>
            <span className="small-note">
              {batch} · {dept}
              {degree ? ` · ${degree}` : ""}
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
