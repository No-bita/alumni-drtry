import { Link } from "react-router-dom";
import { Avatar } from "./Avatar";
import { api, type SearchProfileView } from "../api/client";
import { matchReasonLabel } from "../lib/matchReasonLabels";

type SearchResultRowProps = {
  profile: SearchProfileView;
  style?: React.CSSProperties;
  /** Zero-based position in the current merged result list (for analytics). */
  resultIndex: number;
  searchSessionId?: string | null;
};

/** Role + organization from current occupation (no department/batch — those have their own line). */
function roleOrgLine(profile: SearchProfileView): string | null {
  if (profile.headlineRoleTitle && profile.headlineOrganizationName) {
    return `${profile.headlineRoleTitle} · ${profile.headlineOrganizationName}`;
  }
  if (profile.headlineRoleTitle) return profile.headlineRoleTitle;
  return null;
}

function departmentBatchLine(profile: SearchProfileView): string | null {
  const dept =
    profile.departmentName?.trim() ||
    profile.parsedDepartmentName?.trim() ||
    (profile.departmentCode ? profile.departmentCode.toUpperCase() : "");
  const yr = profile.batchYear ?? profile.parsedJoiningYear;
  const parts = [dept, yr != null ? String(yr) : ""].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function residenceLine(profile: SearchProfileView): string | null {
  const city = profile.residenceCity?.trim();
  const country = profile.residenceCountry?.trim();
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;
  return null;
}

export function SearchResultRow({ profile, style, resultIndex, searchSessionId }: SearchResultRowProps) {
  const roleOrg = roleOrgLine(profile);
  const deptBatch = departmentBatchLine(profile);
  const loc = residenceLine(profile);
  const reasons = profile.matchReasons ?? [];

  const handleClick = () => {
    if (!searchSessionId) return;
    void api.post("/v1/discovery/analytics/profile-click", {
      searchSessionId,
      profileId: profile.id,
      resultPosition: resultIndex
    });
  };

  return (
    <Link
      to={`/profiles/${profile.id}`}
      className="search-result-row"
      style={style}
      onClick={handleClick}
    >
      <Avatar name={profile.fullName} size="sm" tone="pastel" />
      <div className="search-result-row__text">
        <span className="search-result-row__name">{profile.fullName}</span>
        {roleOrg ? <span className="search-result-row__meta">{roleOrg}</span> : null}
        {deptBatch ? <span className="search-result-row__meta">{deptBatch}</span> : null}
        {!roleOrg && !deptBatch ? (
          <span className="search-result-row__meta">IIT BHU alum</span>
        ) : null}
        {loc ? (
          <span className="search-result-row__meta search-result-row__meta--muted">{loc}</span>
        ) : null}
        {reasons.length > 0 ? (
          <span className="search-result-row__reasons" aria-label="Why this result matched">
            {reasons.map((key) => (
              <span key={key} className="search-result-row__reason-chip">
                {matchReasonLabel(key)}
              </span>
            ))}
          </span>
        ) : null}
      </div>
      <span className="search-result-row__chevron" aria-hidden>
        →
      </span>
    </Link>
  );
}
