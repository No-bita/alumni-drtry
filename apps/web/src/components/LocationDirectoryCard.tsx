import { Link } from "react-router-dom";
import { Avatar } from "./Avatar";
import { api, type SearchProfileView } from "../api/client";

type LocationDirectoryCardProps = {
  profile: SearchProfileView;
  resultIndex: number;
  searchSessionId?: string | null;
};

function headline(profile: SearchProfileView): string {
  if (profile.headlineRoleTitle && profile.headlineOrganizationName) {
    return `${profile.headlineRoleTitle} · ${profile.headlineOrganizationName}`;
  }
  if (profile.headlineRoleTitle) return profile.headlineRoleTitle;
  const dept = profile.departmentName ?? profile.parsedDepartmentName ?? profile.departmentCode ?? "";
  const yr = profile.batchYear ?? profile.parsedJoiningYear;
  const parts = [dept, yr != null ? String(yr) : ""].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "IIT BHU alum";
}

function residenceLine(profile: SearchProfileView): string | null {
  const city = profile.residenceCity?.trim();
  const country = profile.residenceCountry?.trim();
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;
  return null;
}

function tintFromName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h << 5) - h + name.charCodeAt(i);
  const hue = Math.abs(h) % 360;
  return `linear-gradient(145deg, hsla(${hue}, 42%, 42%, 0.35) 0%, hsla(${(hue + 40) % 360}, 38%, 32%, 0.5) 100%)`;
}

export function LocationDirectoryCard({ profile, resultIndex, searchSessionId }: LocationDirectoryCardProps) {
  const meta = headline(profile);
  const loc = residenceLine(profile);
  const tint = tintFromName(profile.fullName || profile.id);

  const handleClick = () => {
    if (!searchSessionId) return;
    void api.post("/v1/discovery/analytics/profile-click", {
      searchSessionId,
      profileId: profile.id,
      resultPosition: resultIndex
    });
  };

  return (
    <Link to={`/profiles/${profile.id}`} className="location-card" onClick={handleClick}>
      <div className="location-card__visual" style={{ background: tint }}>
        <Avatar name={profile.fullName} size="lg" tone="pastel" className="location-card__avatar" />
      </div>
      <div className="location-card__body">
        <span className="location-card__name">{profile.fullName}</span>
        <span className="location-card__role" title={meta}>
          {meta}
        </span>
        {loc ? (
          <span className="location-card__place" title={loc}>
            {loc}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
