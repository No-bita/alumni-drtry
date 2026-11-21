import { FormField } from "../forms";
import {
  PROFILE_OCCUPATION_TYPE_OPTIONS,
  type OccupationDraft,
} from "../../lib/occupationProfileEdit";

type ProfileExperienceFieldsProps = {
  draft: OccupationDraft;
  onDraftChange: (patch: Partial<OccupationDraft>) => void;
  /** Per-field validation messages from the owning dialog (keys are draft field names). */
  errors?: { roleTitle?: string; endMonth?: string };
  showRemove?: boolean;
  onRemove?: () => void;
};

export function ProfileExperienceFields({
  draft,
  onDraftChange,
  errors,
  showRemove = false,
  onRemove,
}: ProfileExperienceFieldsProps) {
  return (
    <div className="profile-page__exp-edit-fields">
      {showRemove ? (
        <div className="profile-page__exp-edit-head">
          <span className="profile-page__exp-edit-label">
            {draft.isNew ? "New experience" : draft.isCurrent ? "Current role" : "Past role"}
          </span>
          {onRemove ? (
            <button type="button" className="profile-page__exp-edit-remove" onClick={onRemove}>
              Remove
            </button>
          ) : null}
        </div>
      ) : null}
      <FormField label="Role" required error={errors?.roleTitle}>
        <input
          className="input"
          value={draft.roleTitle}
          onChange={(e) => onDraftChange({ roleTitle: e.target.value })}
        />
      </FormField>
      <FormField label="Company">
        <input
          className="input"
          value={draft.organizationName}
          onChange={(e) => onDraftChange({ organizationName: e.target.value })}
        />
      </FormField>
      <FormField label="Employment type">
        <select
          className="input profile-page__exp-edit-select"
          value={draft.occupationTypeCode}
          onChange={(e) => onDraftChange({ occupationTypeCode: e.target.value })}
        >
          {PROFILE_OCCUPATION_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </FormField>
      <div className="profile-page__exp-edit-dates">
        <FormField label="Start">
          <input
            className="input"
            type="month"
            value={draft.startMonth}
            onChange={(e) => onDraftChange({ startMonth: e.target.value })}
          />
        </FormField>
        <label className="profile-page__exp-edit-current">
          <input
            type="checkbox"
            checked={draft.isCurrent}
            onChange={(e) =>
              onDraftChange({
                isCurrent: e.target.checked,
                endMonth: e.target.checked ? "" : draft.endMonth,
              })
            }
          />
          Current role
        </label>
        {!draft.isCurrent ? (
          <FormField label="End" error={errors?.endMonth}>
            <input
              className="input"
              type="month"
              value={draft.endMonth}
              onChange={(e) => onDraftChange({ endMonth: e.target.value })}
            />
          </FormField>
        ) : null}
      </div>
    </div>
  );
}
