import type { PublicProfileView } from "../../api/client";
import { Input } from "../Input";

type ProfileDepartmentEditProps = {
  profile: PublicProfileView | null | undefined;
  draftDepartmentOtherText: string;
  onDraftDepartmentOtherText: (value: string) => void;
};

/**
 * Edit Profile: the member-typed department lives in its own section, outside the
 * private-contact block — after approval it is public, unlike email and mobile.
 */
export function ProfileDepartmentEdit({
  profile,
  draftDepartmentOtherText,
  onDraftDepartmentOtherText,
}: ProfileDepartmentEditProps) {
  if (profile?.departmentCode !== "other") {
    return null;
  }
  return (
    <article className="home-dashboard__card profile-page__about-card">
      <h2 className="profile-page__section-title">Department</h2>
      <p className="body-text profile-page__muted-text profile-page__flush-text">
        This shows on your public profile once approved. The department itself stays locked after onboarding.
      </p>
      <div className="profile-page__edit-grid">
        <Input
          id="profile-department-other"
          label="Your department (shown instead of Other)"
          value={draftDepartmentOtherText}
          onChange={(e) => onDraftDepartmentOtherText(e.target.value.slice(0, 80))}
          maxLength={80}
          autoComplete="off"
        />
        {profile.departmentOtherStatus === "pending" ? (
          <p className="profile-about__review-note" role="status">
            We review your department before it shows on your profile. Changing it sends it back for review.
          </p>
        ) : null}
        {profile.departmentOtherStatus === "rejected" ? (
          <p className="profile-about__review-note profile-about__review-note--rejected" role="alert">
            Your department wasn&apos;t approved
            {profile.departmentOtherRejectionReason ? `: ${profile.departmentOtherRejectionReason}` : "."}
            {" "}Edit it above to send it back for review.
          </p>
        ) : null}
      </div>
    </article>
  );
}
