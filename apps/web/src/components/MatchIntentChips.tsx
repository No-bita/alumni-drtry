import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  MATCH_CATEGORIES,
  MATCH_CATEGORY_LABELS,
  isMatchCategory,
  type MatchIntent,
  type MatchOverrideField,
} from "../lib/matchApi";

type TextField = Exclude<MatchOverrideField, "category">;

const FIELD_LABELS: Record<TextField, string> = {
  company: "Company",
  role: "Role",
  city: "City",
  country: "Country",
};

type MatchIntentChipsProps = {
  intent: MatchIntent;
  disabled?: boolean;
  /** Field to open for editing on mount (e.g. "city" when the matcher needs it). */
  autoEditField?: TextField | null;
  onChange: (field: MatchOverrideField, value: string | null) => void;
};

function TextChip({
  field,
  value,
  disabled,
  autoEdit,
  onChange,
}: {
  field: TextField;
  value: string | null;
  disabled?: boolean;
  autoEdit?: boolean;
  onChange: (value: string | null) => void;
}) {
  const [editing, setEditing] = useState(Boolean(autoEdit));
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const label = FIELD_LABELS[field];

  if (editing) {
    const save = (e: FormEvent) => {
      e.preventDefault();
      setEditing(false);
      const next = draft.trim();
      if (next !== (value ?? "")) onChange(next.length > 0 ? next : null);
    };
    return (
      <form className="match-chip match-chip--editing" onSubmit={save}>
        <label htmlFor={inputId} className="match-chip__label">
          {label}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className="match-chip__input"
          value={draft}
          maxLength={120}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
        />
        <button type="submit" className="match-chip__action">
          Save
        </button>
      </form>
    );
  }

  if (!value) {
    return (
      <button
        type="button"
        className="match-chip match-chip--add"
        disabled={disabled}
        onClick={() => {
          setDraft("");
          setEditing(true);
        }}
      >
        + {label}
      </button>
    );
  }

  return (
    <span className="match-chip">
      <button
        type="button"
        className="match-chip__value"
        disabled={disabled}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        aria-label={`${label}: ${value}. Edit`}
      >
        <span className="match-chip__label">{label}</span>
        <span>{value}</span>
      </button>
      <button
        type="button"
        className="match-chip__clear"
        disabled={disabled}
        onClick={() => onChange(null)}
        aria-label={`Remove ${label.toLowerCase()}`}
      >
        ×
      </button>
    </span>
  );
}

/** What we understood from the question — every field is editable so a wrong read can be fixed. */
export function MatchIntentChips({ intent, disabled, autoEditField, onChange }: MatchIntentChipsProps) {
  const selectId = useId();
  return (
    <div className="match-chips" role="group" aria-label="What we understood">
      <span className="match-chip match-chip--select">
        <label htmlFor={selectId} className="match-chip__label">
          Looking for
        </label>
        <select
          id={selectId}
          className="match-chip__select"
          value={intent.category ?? ""}
          disabled={disabled}
          onChange={(e) => onChange("category", isMatchCategory(e.target.value) ? e.target.value : null)}
        >
          <option value="">Not sure yet</option>
          {MATCH_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {MATCH_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </span>
      {(["company", "role", "city"] as const).map((field) => (
        <TextChip
          key={field}
          field={field}
          value={intent[field]}
          disabled={disabled}
          autoEdit={autoEditField === field}
          onChange={(v) => onChange(field, v)}
        />
      ))}
      {!intent.city && intent.country ? (
        <TextChip field="country" value={intent.country} disabled={disabled} onChange={(v) => onChange("country", v)} />
      ) : null}
    </div>
  );
}
