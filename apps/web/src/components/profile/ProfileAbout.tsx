import type { PublicProfileView } from "../../api/client";
import { profileShowsAboutSection } from "../../lib/profileAbout";
import { FormField } from "../forms";
import { RESIDENCE_COUNTRY_LIST_ID, RESIDENCE_COUNTRY_NAMES } from "../../lib/countries";

type ProfileAboutProps = {
  loading: boolean;
  profile: PublicProfileView | null | undefined;
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

export function ProfileAbout({
  loading,
  profile,
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
    !profileShowsAboutSection({ loading, profile, isOwnProfile, isEditing })
  ) {
    return null;
  }

  const bioRaw = profile?.bio?.trim() ?? "";
  const showBio = !loading && bioRaw.length > 0;

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
          <FormField label="Personal email (optional)">
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={draftPersonalEmail}
              onChange={(e) => onDraftPersonalEmail(e.target.value)}
            />
          </FormField>
          <FormField label="Mobile (optional)">
            <input
              className="input"
              type="tel"
              autoComplete="tel"
              value={draftMobilePhone}
              onChange={(e) => onDraftMobilePhone(e.target.value)}
            />
          </FormField>
          <FormField label="Country of residence (optional)">
            <input
              className="input"
              value={draftResidenceCountry}
              onChange={(e) => onDraftResidenceCountry(e.target.value)}
              autoComplete="country-name"
              list={RESIDENCE_COUNTRY_LIST_ID}
            />
          </FormField>
          <datalist id={RESIDENCE_COUNTRY_LIST_ID}>
            {RESIDENCE_COUNTRY_NAMES.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <FormField label="City of residence (optional)">
            <input
              id="profile-residence-city"
              className="input"
              value={draftResidenceCity}
              onChange={(e) => onDraftResidenceCity(e.target.value)}
              autoComplete="address-level2"
            />
          </FormField>
        </div>
      ) : null}
    </article>
  );
}
