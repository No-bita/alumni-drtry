import { Link } from "react-router-dom";
import { Avatar } from "./Avatar";
import { type SearchProfileView } from "../api/client";
import { demoDisplayFullName } from "../lib/demoProfile";

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
  void resultIndex;
  const loc = residenceLine(profile);
  const displayName = demoDisplayFullName(profile.fullName) || (profile.fullName ?? "").trim() || profile.id;
  const tint = tintFromName(displayName || profile.id);

  const handleClick = () => {
    if (!searchSessionId) return;
    // Directory profile-click analytics disabled — re-enable when needed:
    // void api.post("/v1/discovery/analytics/profile-click", {
    //   searchSessionId,
    //   profileId: profile.id,
    //   resultPosition: resultIndex
    // });
  };

  return (
    <Link to={`/profiles/${profile.id}`} className="location-card" onClick={handleClick}>
      <div className="location-card__visual" style={{ background: tint }}>
        <Avatar
          name={displayName}
          size="lg"
          tone="pastel"
          className="location-card__avatar"
        />
      </div>
      <div className="location-card__body">
        <span className="location-card__name">{displayName}</span>
        <span className="location-card__role" title={loc ?? "Location not set"}>
          {loc ?? "Location not set"}
        </span>
      </div>
    </Link>
  );
}
