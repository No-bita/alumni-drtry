import type { PastRoleDraft } from "../../lib/answerKey";
import "./OnboardingAnswerKey.css";

type OnboardingPastRolesProps = {
  rows: PastRoleDraft[];
  onChange: (rows: PastRoleDraft[]) => void;
  onFieldEnter?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
};

/** Onboarding: up to two previous roles (company + role). Powers "previously at X" and career-switch matches. */
export function OnboardingPastRoles({ rows, onChange, onFieldEnter }: OnboardingPastRolesProps) {
  const update = (index: number, field: keyof PastRoleDraft, value: string) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };
  return (
    <div className="onboarding-past-roles">
      <p className="onboarding-answer-key__hint">
        Optional. Juniors often look for someone who’s worked somewhere before, or made the switch they’re planning.
      </p>
      {rows.map((row, index) => (
        <fieldset key={index} className="onboarding-past-roles__row">
          <legend className="onboarding-past-roles__legend">Previous role {index + 1}</legend>
          <label className="onboarding-past-roles__field">
            <span className="onboarding-past-roles__label">Company</span>
            <input
              className="onboarding-welcome__inline-input"
              aria-label={`Previous role ${index + 1}: company`}
              autoComplete="organization"
              maxLength={200}
              value={row.company}
              onChange={(e) => update(index, "company", e.target.value)}
              onKeyDown={onFieldEnter}
            />
          </label>
          <label className="onboarding-past-roles__field">
            <span className="onboarding-past-roles__label">Role</span>
            <input
              className="onboarding-welcome__inline-input"
              aria-label={`Previous role ${index + 1}: role`}
              autoComplete="organization-title"
              maxLength={200}
              value={row.role}
              onChange={(e) => update(index, "role", e.target.value)}
              onKeyDown={onFieldEnter}
            />
          </label>
        </fieldset>
      ))}
    </div>
  );
}
