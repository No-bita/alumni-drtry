import { Link } from "react-router-dom";
import { Avatar } from "./Avatar";
import type { SearchProfileView } from "../api/client";
import { demoDisplayFullName } from "../lib/demoProfile";

type HomeNetworkPanelProps = {
  members: SearchProfileView[];
  directoryHref: string;
};

export function HomeNetworkPanel({
  members,
  directoryHref,
}: HomeNetworkPanelProps) {
  const avatars = members.slice(0, 6);
  const overflow = Math.max(0, members.length - avatars.length);
  const showBlurredPlaceholders = avatars.length === 0;

  return (
    <section className="home-ideal__panel" aria-labelledby="home-network-heading">
      <h2 id="home-network-heading" className="home-ideal__panel-title">
        Your Network
      </h2>
      <div className="home-ideal__avatars" aria-label="Batch avatars">
        {showBlurredPlaceholders
          ? Array.from({ length: 6 }, (_, idx) => (
              <span
                key={`placeholder-${idx}`}
                className="home-ideal__avatar-placeholder"
                aria-hidden
              />
            ))
          : avatars.map((member) => {
              const displayName = demoDisplayFullName(member.fullName) || member.fullName.trim();
              return (
                <Link key={member.id} to={`/profiles/${member.id}`}>
                  <Avatar name={displayName} size="sm" tone="pastel" />
                </Link>
              );
            })}
        {overflow > 0 ? <span className="home-ideal__avatar-overflow">+{overflow}</span> : null}
      </div>
      <p className="home-ideal__panel-copy">Strengthen your batch network and stay connected.</p>
      <div className="home-ideal__panel-actions">
        <button type="button" className="btn btn--primary">
          Invite batchmates
        </button>
        <Link to={directoryHref} className="btn btn--secondary">
          View all alumni
        </Link>
      </div>
    </section>
  );
}
