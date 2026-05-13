import { Link } from "react-router-dom";
import { Avatar } from "./Avatar";
import { type SearchProfileView } from "../api/client";
import { demoDisplayFullName, isDemoProfileBio } from "../lib/demoProfile";
import { matchReasonLabel } from "../lib/matchReasonLabels";
import { DeptBatchMeta } from "./DeptBatchMeta";
import { IconMapPin } from "./LocationPageIcons";

type SearchResultRowProps = {
  profile: SearchProfileView;
  style?: React.CSSProperties;
  /** Zero-based position in the current merged result list (for analytics). */
  resultIndex: number;
  searchSessionId?: string | null;
  onRowClick?: () => void;
};

/** Role + organization from current occupation (no department/batch — those have their own line). */
function roleOrgLine(profile: SearchProfileView): string | null {
  if (profile.headlineRoleTitle && profile.headlineOrganizationName) {
    return `${profile.headlineRoleTitle} @ ${profile.headlineOrganizationName}`;
  }
  if (profile.headlineRoleTitle) return profile.headlineRoleTitle;
  return null;
}

function residenceLine(profile: SearchProfileView): string | null {
  const city = profile.residenceCity?.trim();
  const country = profile.residenceCountry?.trim();
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;
  return null;
}

/** Speech bubble + ellipsis — pairs with primary Message CTA. */
function IconMessageDots({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 11.5c0 4.1-3.4 7.5-7.6 7.5h-5l-4.9 3v-3H5a7.6 7.6 0 010-15h8.4c4.2 0 7.6 3.4 7.6 7.5z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="11.5" r="1.15" fill="currentColor" />
      <circle cx="12" cy="11.5" r="1.15" fill="currentColor" />
      <circle cx="15" cy="11.5" r="1.15" fill="currentColor" />
    </svg>
  );
}

function IconArrowRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function SearchResultRow({ profile, style, resultIndex, searchSessionId, onRowClick }: SearchResultRowProps) {
  void resultIndex;
  const roleOrg = roleOrgLine(profile);
  const codeRaw = profile.departmentCode;
  const deptCode = codeRaw?.trim() ? codeRaw : null;
  const batchYr = profile.batchYear ?? null;
  const hasDeptBatchMeta = Boolean(
    deptCode || (typeof batchYr === "number" && Number.isFinite(batchYr)),
  );
  const loc = residenceLine(profile);
  const showContextLine = Boolean(hasDeptBatchMeta || loc);
  const isDemo = isDemoProfileBio(profile.bio);
  const rawFullName = (profile.fullName ?? "").trim();
  const displayName = demoDisplayFullName(profile.fullName) || rawFullName;
  const matchChipItems = [...new Set(profile.matchReasons ?? [])].slice(0, 6).map((reason) => ({
    key: reason,
    label: matchReasonLabel(reason),
  }));

  const profileHref = `/profiles/${profile.id}`;

  const viewProfileControl =
    onRowClick != null ? (
      <Link
        className="search-result-row__cta-secondary"
        to={profileHref}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        View profile
        <IconArrowRight className="search-result-row__cta-secondary-icon" />
      </Link>
    ) : (
      <span className="search-result-row__cta-secondary">
        View profile
        <IconArrowRight className="search-result-row__cta-secondary-icon" />
      </span>
    );

  const handleClick = () => {
    if (!searchSessionId) return;
    // Directory profile-click analytics disabled — re-enable when needed:
    // void api.post("/v1/discovery/analytics/profile-click", {
    //   searchSessionId,
    //   profileId: profile.id,
    //   resultPosition: resultIndex
    // });
  };

  const avatar = onRowClick ? (
    <Link
      to={`/profiles/${profile.id}`}
      onClick={(e) => e.stopPropagation()}
      className="search-result-row__avatar-link"
      aria-label={`View ${displayName}'s profile`}
    >
      <Avatar name={displayName} size="sm" tone="pastel" />
    </Link>
  ) : (
    <Avatar name={displayName} size="sm" tone="pastel" />
  );

  const content = (
    <>
      {avatar}
      <div className="search-result-row__text">
        <div className="search-result-row__top">
          <span className="search-result-row__name-row">
            <span className="search-result-row__name">{displayName}</span>
            {isDemo ? <span className="badge badge--hiring search-result-row__demo-badge">Demo</span> : null}
          </span>
          {matchChipItems.length > 0 ? (
            <span className="search-result-row__match-chips" aria-label="Why this profile matched">
              {matchChipItems.map(({ key, label }) => (
                <span key={key} className="search-result-row__chip">
                  {label}
                </span>
              ))}
            </span>
          ) : null}
        </div>
        {roleOrg ? (
          <span className="search-result-row__meta search-result-row__meta--role">{roleOrg}</span>
        ) : null}
        {showContextLine ? (
          <span className="search-result-row__meta search-result-row__context-line">
            {hasDeptBatchMeta ? (
              <DeptBatchMeta className="dept-batch-meta" departmentCode={deptCode} batchYear={batchYr} />
            ) : null}
            {hasDeptBatchMeta && loc ? (
              <span className="dept-batch-meta__sep" aria-hidden>
                <span className="dept-batch-meta__sep-dot" />
              </span>
            ) : null}
            {loc ? (
              <span className="search-result-row__location">
                <IconMapPin className="search-result-row__location-icon" aria-hidden />
                <span className="visually-hidden">Location </span>
                {loc}
              </span>
            ) : null}
          </span>
        ) : null}
        {!roleOrg && !hasDeptBatchMeta && !loc ? (
          <span className="search-result-row__meta">IIT BHU alum</span>
        ) : null}
        <span className="search-result-row__actions">
          <button
            type="button"
            className="search-result-row__cta-primary"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              window.dispatchEvent(
                new CustomEvent("messaging:open-draft", {
                  detail: {
                    recipientPersonId: profile.id,
                    recipientName: displayName,
                    initialMessage: "",
                    kind: "general",
                  },
                })
              );
            }}
          >
            <IconMessageDots className="search-result-row__cta-primary-icon" />
            Message
          </button>
          {viewProfileControl}
        </span>
      </div>
    </>
  );

  if (onRowClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        className="search-result-row search-result-row--button"
        style={style}
        onClick={() => {
          handleClick();
          onRowClick();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
            onRowClick();
          }
        }}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      to={profileHref}
      className="search-result-row"
      style={style}
      onClick={handleClick}
    >
      {content}
    </Link>
  );
}
