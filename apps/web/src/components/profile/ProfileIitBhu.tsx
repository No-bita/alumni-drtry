import { Link } from "react-router-dom";
import type { PublicProfileView } from "../../api/client";

type ProfileIitBhuProps = {
  loading: boolean;
  profile: PublicProfileView | null | undefined;
  isOwnProfile: boolean;
  onboardingIncomplete: boolean;
};

function IconCampus({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden>
      <path d="M3 10.5L12 4l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z" strokeLinejoin="round" />
    </svg>
  );
}

function profileHasJoiningYear(profile: PublicProfileView | null | undefined): boolean {
  if (!profile) return false;
  return (
    typeof profile.parsedJoiningYear === "number" && Number.isFinite(profile.parsedJoiningYear)
  );
}

export function ProfileIitBhu({
  loading,
  profile,
  isOwnProfile,
  onboardingIncomplete,
}: ProfileIitBhuProps) {
  if (!loading && !profileHasJoiningYear(profile)) {
    if (!isOwnProfile || !onboardingIncomplete) return null;
  }

  const joinYear =
    typeof profile?.parsedJoiningYear === "number" && Number.isFinite(profile.parsedJoiningYear)
      ? profile.parsedJoiningYear
      : null;
  const joinLabel = joinYear ? `Joined ${joinYear}` : null;

  return (
    <article className="home-dashboard__card profile-page__iit-card">
      <header className="profile-page__iit-head">
        <IconCampus className="profile-page__iit-icon" aria-hidden />
        <h2 className="profile-page__iit-title">At IIT BHU</h2>
      </header>

      {loading ? (
        <div className="profile-page__iit-skeleton">
          <span className="profile-page__skeleton-line profile-page__skeleton-line--body" />
        </div>
      ) : isOwnProfile && onboardingIncomplete && !profileHasJoiningYear(profile) ? (
        <p className="body-text profile-page__muted-text profile-page__flush-text">
          Finish{" "}
          <Link to="/onboarding" className="home-dashboard__text-link">
            onboarding
          </Link>{" "}
          to show your IIT BHU details here.
        </p>
      ) : joinLabel ? (
        <div className="profile-page__iit-list">
          <div className="profile-page__iit-row">
            <span className="profile-page__iit-label">Joining year</span>
            <span className="profile-page__iit-value">{joinLabel}</span>
          </div>
        </div>
      ) : null}
    </article>
  );
}
