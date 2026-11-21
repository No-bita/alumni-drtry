import { useRef, type ReactNode } from "react";

export type ChoiceCardOption = {
  value: string;
  title: string;
  description?: string;
  icon?: ReactNode;
};

type ChoiceCardsProps = {
  options: ChoiceCardOption[];
  value: string | null;
  onChange: (value: string) => void;
  /** Accessible group label, e.g. "What are you looking for?" */
  ariaLabel: string;
  className?: string;
};

/**
 * Single-select choice cards from the form design sheets (radio semantics, card look).
 * Arrow keys move between options; selection follows focus like a native radio group.
 */
export function ChoiceCards({ options, value, onChange, ariaLabel, className = "" }: ChoiceCardsProps) {
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusAndSelect = (index: number) => {
    const clamped = (index + options.length) % options.length;
    cardRefs.current[clamped]?.focus();
    onChange(options[clamped].value);
  };

  return (
    <div className={`choice-cards${className ? ` ${className}` : ""}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              cardRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (value === null && index === 0) ? 0 : -1}
            className={`choice-card${checked ? " choice-card--checked" : ""}`}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                event.preventDefault();
                focusAndSelect(index + 1);
              } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                event.preventDefault();
                focusAndSelect(index - 1);
              }
            }}
          >
            {option.icon ? <span className="choice-card__icon" aria-hidden="true">{option.icon}</span> : null}
            <span className="choice-card__text">
              <span className="choice-card__title">{option.title}</span>
              {option.description ? <span className="choice-card__description">{option.description}</span> : null}
            </span>
            <span className="choice-card__check" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
