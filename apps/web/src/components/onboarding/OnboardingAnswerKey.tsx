import { ANSWER_KEY_EXAMPLES, ANSWER_KEY_ORDER } from "../../lib/answerKey";
import {
  OPEN_TO_CATALOG,
  OPEN_TO_MAX_SELECTED,
  canSelectMoreOpenTo,
  isOpenToSelected,
  toggleOpenToSelection,
  type OpenToPreferences,
} from "../../lib/openToPreferences";
import "./OnboardingAnswerKey.css";

type OnboardingAnswerKeyProps = {
  value: OpenToPreferences;
  onChange: (next: OpenToPreferences) => void;
};

/** Onboarding: "What can you help with?" — picks Open-to tags, each shown with the question it routes. */
export function OnboardingAnswerKey({ value, onChange }: OnboardingAnswerKeyProps) {
  const full = !canSelectMoreOpenTo(value);
  return (
    <div className="onboarding-answer-key">
      <p className="onboarding-answer-key__hint">
        Pick up to {OPEN_TO_MAX_SELECTED}. Juniors asking these kinds of questions will be sent to you. You can change this
        anytime on your profile.
      </p>
      <div
        className="onboarding-welcome__inline-options onboarding-welcome__inline-options--stack"
        role="group"
        aria-label="What can you help with?"
      >
        {ANSWER_KEY_ORDER.map((id) => {
          const selected = isOpenToSelected(value, id);
          return (
            <button
              key={id}
              type="button"
              className={`chip onboarding-answer-key__option${selected ? " chip--active" : ""}`}
              aria-pressed={selected}
              disabled={!selected && full}
              onClick={() => onChange(toggleOpenToSelection(value, id))}
            >
              <span className="onboarding-answer-key__title">{OPEN_TO_CATALOG[id].title}</span>
              <span className="onboarding-answer-key__example">{ANSWER_KEY_EXAMPLES[id]}</span>
            </button>
          );
        })}
      </div>
      <p className="onboarding-answer-key__count" aria-live="polite">
        {value.selected.length}/{OPEN_TO_MAX_SELECTED} selected
      </p>
    </div>
  );
}
