import { Link } from "react-router-dom";
import { Avatar } from "./Avatar";
import { api, type SearchProfileView } from "../api/client";

type LocationDirectoryCardProps = {
  profile: SearchProfileView;
  resultIndex: number;
  searchSessionId?: string | null;
};

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
        <Avatar
          name={profile.fullName}
          size="lg"
          tone="pastel"
          className="location-card__avatar"
          departmentCode={profile.departmentCode ?? profile.parsedDepartmentCode}
        />
      </div>
      <div className="location-card__body">
        <span className="location-card__name">{profile.fullName}</span>
        <span className="location-card__role" title={loc ?? "Location not set"}>
          {loc ?? "Location not set"}
        </span>
      </div>
    </Link>
  );
}
