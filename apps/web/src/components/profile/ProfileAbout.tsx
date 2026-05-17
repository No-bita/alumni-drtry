import type { PublicProfileView } from "../../api/client";
import { isDemoProfileBio } from "../../lib/demoProfile";
import { Input } from "../Input";

type ProfileAboutProps = {
  loading: boolean;
  profile: PublicProfileView | null | undefined;
  isDemoProfile: boolean;
  isOwnProfile: boolean;
  isEditing: boolean;
  draftPersonalEmail: string;
  draftMobilePhone: string;
  draftResidenceCountry: string;
  draftResidenceCity: string;
  onDraftPersonalEmail: (value: string) => void;
  onDraftMobilePhone: (value: string) => void;
  onDraftResidenceCountry: (value: string) => void;
  onDraftResidenceCity: (value: string) => void;
};

export function profileShowsAboutSection(params: {
  loading: boolean;
  profile: PublicProfileView | null | undefined;
  isDemoProfile: boolean;
  isOwnProfile: boolean;
  isEditing: boolean;
}): boolean {
  const { loading, profile, isDemoProfile, isEditing } = params;
  if (loading || isEditing) return true;
  const bioRaw = profile?.bio?.trim() ?? "";
  const showBio = bioRaw.length > 0 && !isDemoProfile && !isDemoProfileBio(profile?.bio);
  return showBio;
}

export function ProfileAbout({
  loading,
  profile,
  isDemoProfile,
  isOwnProfile,
  isEditing,
  draftPersonalEmail,
  draftMobilePhone,
  draftResidenceCountry,
  draftResidenceCity,
  onDraftPersonalEmail,
  onDraftMobilePhone,
  onDraftResidenceCountry,
  onDraftResidenceCity,
}: ProfileAboutProps) {
  if (
    !profileShowsAboutSection({ loading, profile, isDemoProfile, isOwnProfile, isEditing })
  ) {
    return null;
  }

  const bioRaw = profile?.bio?.trim() ?? "";
  const showBio = !loading && bioRaw.length > 0 && !isDemoProfile && !isDemoProfileBio(profile?.bio);

  return (
    <article className="home-dashboard__card profile-page__about-card">
      <h2 className="profile-page__section-title">About</h2>
      {loading ? (
        <div className="profile-page__skeleton-block">
          <span className="profile-page__skeleton-line profile-page__skeleton-line--body" />
          <span className="profile-page__skeleton-line profile-page__skeleton-line--body" />
        </div>
      ) : showBio ? (
        <p className="body-text profile-page__about-bio">{bioRaw}</p>
      ) : isOwnProfile && isEditing ? (
        <p className="body-text profile-page__muted-text profile-page__flush-text">
          Add contact details below. They are not shown on your public profile.
        </p>
      ) : null}
      {isOwnProfile && isEditing ? (
        <div className="profile-page__edit-grid">
          <p className="profile-page__pii-notice">
            Personal email and mobile are private. They are only shared when you choose to disclose
            them in a conversation.
          </p>
          <Input
            label="Personal email (optional)"
            type="email"
            autoComplete="email"
            value={draftPersonalEmail}
            onChange={(e) => onDraftPersonalEmail(e.target.value)}
          />
          <Input
            label="Mobile (optional)"
            type="tel"
            autoComplete="tel"
            value={draftMobilePhone}
            onChange={(e) => onDraftMobilePhone(e.target.value)}
          />
          <Input
            label="Country of residence (optional)"
            value={draftResidenceCountry}
            onChange={(e) => onDraftResidenceCountry(e.target.value)}
            autoComplete="country-name"
          />
          <Input
            label="City of residence (optional)"
            value={draftResidenceCity}
            onChange={(e) => onDraftResidenceCity(e.target.value)}
            autoComplete="address-level2"
          />
        </div>
      ) : null}
    </article>
  );
}
