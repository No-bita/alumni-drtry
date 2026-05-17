import { Input } from "../Input";
import {
  PROFILE_OCCUPATION_TYPE_OPTIONS,
  type OccupationDraft,
} from "../../lib/occupationProfileEdit";

type ProfileExperienceFieldsProps = {
  draft: OccupationDraft;
  onDraftChange: (patch: Partial<OccupationDraft>) => void;
  showRemove?: boolean;
  onRemove?: () => void;
};

export function ProfileExperienceFields({
  draft,
  onDraftChange,
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
      <Input
        label="Role"
        value={draft.roleTitle}
        onChange={(e) => onDraftChange({ roleTitle: e.target.value })}
      />
      <Input
        label="Company"
        value={draft.organizationName}
        onChange={(e) => onDraftChange({ organizationName: e.target.value })}
      />
      <label className="ui-label input-field__label" htmlFor={`exp-type-${draft.id}`}>
        Employment type
      </label>
      <select
        id={`exp-type-${draft.id}`}
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
      <div className="profile-page__exp-edit-dates">
        <Input
          label="Start"
          type="month"
          value={draft.startMonth}
          onChange={(e) => onDraftChange({ startMonth: e.target.value })}
        />
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
          <Input
            label="End"
            type="month"
            value={draft.endMonth}
            onChange={(e) => onDraftChange({ endMonth: e.target.value })}
          />
        ) : null}
      </div>
    </div>
  );
}
