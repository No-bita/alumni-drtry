import type { PublicProfileView } from "../../api/client";
import { profileShowsAboutSection } from "../../lib/profileAbout";
import { Input } from "../Input";

type ProfileAboutProps = {
  loading: boolean;
  profile: PublicProfileView | null | undefined;
  isOwnProfile: boolean;
  isEditing: boolean;
  draftBio: string;
  onDraftBio: (value: string) => void;
  draftPersonalEmail: string;
  draftMobilePhone: string;
  draftResidenceCountry: string;
  draftResidenceCity: string;
  onDraftPersonalEmail: (value: string) => void;
  onDraftMobilePhone: (value: string) => void;
  onDraftResidenceCountry: (value: string) => void;
  onDraftResidenceCity: (value: string) => void;
};

export function ProfileAbout({
  loading,
  profile,
  isOwnProfile,
  isEditing,
  draftBio,
  onDraftBio,
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
    !profileShowsAboutSection({ loading, profile, isOwnProfile, isEditing })
  ) {
    return null;
  }

  const bioRaw = profile?.bio?.trim() ?? "";
  const showBio = !loading && bioRaw.length > 0;

  return (
    <article className="home-dashboard__card profile-page__about-card">
      <h2 className="profile-page__section-title">About</h2>
      {isOwnProfile && isEditing ? (
        <div className="profile-page__intro-edit">
          <label htmlFor="profile-introduction">Introduction (optional)</label>
          <p id="profile-introduction-hint">Shown on your public profile, in your own words.</p>
          <textarea
            id="profile-introduction"
            className="input input--textarea"
            value={draftBio}
            onChange={(event) => onDraftBio(event.target.value)}
            maxLength={3000}
            rows={5}
            aria-describedby="profile-introduction-hint"
          />
          <span>{draftBio.length}/3000</span>
        </div>
      ) : null}
      {loading ? (
        <div className="profile-page__skeleton-block">
          <span className="profile-page__skeleton-line profile-page__skeleton-line--body" />
          <span className="profile-page__skeleton-line profile-page__skeleton-line--body" />
        </div>
      ) : showBio && !isEditing ? (
        <p className="body-text profile-page__about-bio">{bioRaw}</p>
      ) : isOwnProfile && isEditing ? (
        <p className="body-text profile-page__muted-text profile-page__flush-text">
          Add contact details below. They are not shown on your public profile.
        </p>
      ) : null}
      {isOwnProfile && isEditing ? (
        <div className="profile-page__edit-grid">
          <p className="profile-page__pii-notice">
            Personal email and mobile are private. They are not shown on your public profile.
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
