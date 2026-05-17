import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import type { OccupationView, PublicProfileView } from "../../api/client";
import { Button } from "../Button";
import { IconBriefcase } from "../HomeIcons";
import { ProfileExperienceFormDialog } from "./ProfileExperienceFormDialog";
import { ProfileExperienceFields } from "./ProfileExperienceFields";
import {
  createEmptyOccupationDraft,
  PROFILE_OCCUPATION_TYPE_OPTIONS,
  sortOccupationDrafts,
  type OccupationDraft,
} from "../../lib/occupationProfileEdit";
import {
  formatOccupationDatesDurationLine,
  formatOccupationCompanyTypeLine,
  occupationWorkLocationLine,
  sortOccupationsForDisplay,
} from "../../lib/profileDisplay";

type ProfileExperienceProps = {
  loading: boolean;
  occupations: OccupationView[];
  profile?: PublicProfileView | null;
  isOwnProfile: boolean;
  onboardingIncomplete: boolean;
  isEditing?: boolean;
  draftOccupations?: OccupationDraft[];
  onDraftOccupationChange?: (id: string, patch: Partial<OccupationDraft>) => void;
  onCommitExperience?: (draft: OccupationDraft) => void;
  onRemoveExperience?: (id: string) => void;
};

function formatDraftDatesLine(draft: OccupationDraft): string | null {
  const start = draft.startMonth.trim();
  const end = draft.isCurrent ? null : draft.endMonth.trim();
  if (!start && !end) return null;
  const formatMonth = (m: string) => {
    const [y, mo] = m.split("-");
    if (!y || !mo) return m;
    const d = new Date(Number(y), Number(mo) - 1, 1);
    return d.toLocaleString("en-US", { month: "short", year: "numeric" });
  };
  if (draft.isCurrent && start) return `${formatMonth(start)} – Present`;
  if (start && end) return `${formatMonth(start)} – ${formatMonth(end)}`;
  if (start) return formatMonth(start);
  if (end) return formatMonth(end);
  return null;
}

function draftCompanyLine(draft: OccupationDraft): string | null {
  const company = draft.organizationName.trim();
  const typeLabel = PROFILE_OCCUPATION_TYPE_OPTIONS.find(
    (o) => o.value === draft.occupationTypeCode,
  )?.label;
  if (!company && !typeLabel) return null;
  if (company && typeLabel) return `${company} · ${typeLabel}`;
  return company || typeLabel || null;
}

function DraftExperiencePreview({
  draft,
  onEdit,
  onRemove,
}: {
  draft: OccupationDraft;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const role = draft.roleTitle.trim() || "Untitled role";
  const companyLine = draftCompanyLine(draft);
  const datesLine = formatDraftDatesLine(draft);

  return (
    <li className="profile-page__exp-item profile-page__exp-item--draft-preview">
      <span className="profile-page__exp-dot" aria-hidden />
      <div className="profile-page__exp-body">
        <p className="profile-page__exp-role">{role}</p>
        {companyLine ? <p className="profile-page__exp-company-line">{companyLine}</p> : null}
        {datesLine ? <p className="profile-page__exp-dates">{datesLine}</p> : null}
        <p className="profile-page__exp-draft-badge">Pending — save profile to apply</p>
      </div>
      <div className="profile-page__exp-draft-actions">
        <button type="button" className="profile-page__exp-draft-edit" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="profile-page__exp-draft-remove" onClick={onRemove}>
          Remove
        </button>
      </div>
    </li>
  );
}

export function ProfileExperience({
  loading,
  occupations,
  profile,
  isOwnProfile,
  onboardingIncomplete,
  isEditing = false,
  draftOccupations,
  onDraftOccupationChange,
  onCommitExperience,
  onRemoveExperience,
}: ProfileExperienceProps) {
  const sorted = sortOccupationsForDisplay(occupations);
  const sortedDrafts = draftOccupations ? sortOccupationDrafts(draftOccupations) : [];
  const residenceHint = profile
    ? { city: profile.residenceCity, country: profile.residenceCountry }
    : null;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [dialogDraft, setDialogDraft] = useState<OccupationDraft | null>(null);

  const openAddDialog = useCallback(() => {
    setDialogMode("add");
    setDialogDraft(createEmptyOccupationDraft());
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((draft: OccupationDraft) => {
    setDialogMode("edit");
    setDialogDraft(draft);
    setDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setDialogDraft(null);
  }, []);

  const handleDialogConfirm = useCallback(
    (draft: OccupationDraft) => {
      onCommitExperience?.(draft);
    },
    [onCommitExperience],
  );

  const savedDrafts = sortedDrafts.filter((d) => !d.isNew);
  const pendingDrafts = sortedDrafts.filter((d) => d.isNew);
  const hasEditContent = savedDrafts.length > 0 || pendingDrafts.length > 0;

  return (
    <>
      <article className="home-dashboard__card profile-page__exp-card">
        <header className="profile-page__exp-section-head profile-page__exp-section-head--edit">
          <div className="profile-page__exp-section-title-wrap">
            <IconBriefcase className="profile-page__exp-section-icon" aria-hidden />
            <h2 className="profile-page__exp-section-title">Experience</h2>
          </div>
          {isEditing ? (
            <button type="button" className="profile-page__exp-add-btn" onClick={openAddDialog}>
              Add experience
            </button>
          ) : null}
        </header>
        {loading ? (
          <div className="profile-page__skeleton-block profile-page__exp-skeleton">
            <span className="profile-page__skeleton-line profile-page__skeleton-line--exp-title" />
            <span className="profile-page__skeleton-line profile-page__skeleton-line--body" />
            <span className="profile-page__skeleton-line profile-page__skeleton-line--body" />
            <span className="profile-page__skeleton-line profile-page__skeleton-line--body" />
          </div>
        ) : isEditing && draftOccupations ? (
          hasEditContent ? (
            <ul className="profile-page__exp-list profile-page__exp-list--edit">
              {savedDrafts.map((draft) => (
                <li key={draft.id} className="profile-page__exp-item profile-page__exp-item--edit">
                  <ProfileExperienceFields
                    draft={draft}
                    onDraftChange={(patch) => onDraftOccupationChange?.(draft.id, patch)}
                  />
                </li>
              ))}
              {pendingDrafts.map((draft) => (
                <DraftExperiencePreview
                  key={draft.id}
                  draft={draft}
                  onEdit={() => openEditDialog(draft)}
                  onRemove={() => onRemoveExperience?.(draft.id)}
                />
              ))}
            </ul>
          ) : (
            <div className="profile-page__exp-edit-empty">
              <p className="body-text profile-page__muted-text profile-page__flush-text">
                Add your current role or past experience.
              </p>
              <Button variant="secondary" type="button" onClick={openAddDialog}>
                Add experience
              </Button>
            </div>
          )
        ) : sorted.length > 0 ? (
          <ul className="profile-page__exp-list">
            {sorted.map((occ) => {
              const role = occ.roleTitle?.trim() || "—";
              const companyLine = formatOccupationCompanyTypeLine(occ);
              const datesLine = formatOccupationDatesDurationLine(occ);
              const location = occupationWorkLocationLine(occ, residenceHint);
              const description = occ.description?.trim();

              return (
                <li
                  key={occ.id}
                  className={`profile-page__exp-item ${occ.isCurrent ? "profile-page__exp-item--current" : "profile-page__exp-item--past"}`}
                >
                  <span className="profile-page__exp-dot" aria-hidden />
                  <div className="profile-page__exp-body">
                    <p
                      className={`profile-page__exp-role${occ.isCurrent ? " profile-page__exp-role--current" : ""}`}
                    >
                      {role}
                    </p>
                    {companyLine ? (
                      <p className="profile-page__exp-company-line">{companyLine}</p>
                    ) : null}
                    {datesLine ? <p className="profile-page__exp-dates">{datesLine}</p> : null}
                    {location ? <p className="profile-page__exp-location">{location}</p> : null}
                    {description ? <p className="profile-page__exp-desc">{description}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="body-text profile-page__muted-text profile-page__flush-text">
            {isOwnProfile && onboardingIncomplete ? (
              <>
                Add your role and company in{" "}
                <Link to="/onboarding" className="home-dashboard__text-link">
                  onboarding
                </Link>
                .
              </>
            ) : (
              "No experience listed yet."
            )}
          </p>
        )}
      </article>

      <ProfileExperienceFormDialog
        open={dialogOpen}
        draft={dialogDraft}
        mode={dialogMode}
        onClose={closeDialog}
        onConfirm={handleDialogConfirm}
      />
    </>
  );
}
