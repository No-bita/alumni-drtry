import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { assertApiGet } from "../../lib/assertApiGet";
import { queryKeys } from "../../lib/queryKeys";
import {
  ADD_AREA_MESSAGES,
  AREA_SUGGESTION_MIN_QUERY,
  PERSON_AREA_MAX_LENGTH,
  PERSON_AREAS_MAX,
  addArea,
  hasArea,
  normalizeAreaLabel,
  removeArea,
  type AreaSuggestion,
} from "../../lib/personAreas";
import "../../styles/profile-areas.css";

/** DOM id of the area input, so "Add areas" elsewhere on the page can focus it. */
export const PROFILE_AREAS_INPUT_ID = "profile-areas-input";

const SUGGEST_DEBOUNCE_MS = 200;

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function IconAreas({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9L12 3z" strokeLinejoin="round" />
    </svg>
  );
}

type Props = {
  draftAreas: string[];
  onDraftAreasChange: (next: string[]) => void;
};

/**
 * Edit areas of experience: up to 8 short labels. Typing suggests areas other members already use, so
 * spellings converge ("Product management" rather than three variants). Enter or comma adds what's typed.
 */
export function ProfileAreasCard({ draftAreas, onDraftAreasChange }: Props) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const hintId = useId();

  const query = normalizeAreaLabel(text).toLowerCase();
  const debounced = useDebounced(query, SUGGEST_DEBOUNCE_MS);
  const full = draftAreas.length >= PERSON_AREAS_MAX;

  const suggestQuery = useQuery({
    queryKey: queryKeys.areas.suggestions(debounced),
    queryFn: ({ signal }) =>
      assertApiGet<{ suggestions: AreaSuggestion[] }>(`/v1/areas/suggestions?q=${encodeURIComponent(debounced)}`, signal),
    enabled: debounced.length >= AREA_SUGGESTION_MIN_QUERY && !full,
    staleTime: 60_000,
  });

  // Hide areas already on the list, and the suggestions for an older query while a newer one loads.
  const suggestions = useMemo(
    () =>
      debounced === query && query.length >= AREA_SUGGESTION_MIN_QUERY
        ? (suggestQuery.data?.suggestions ?? []).filter((s) => !hasArea(draftAreas, s.label))
        : [],
    [debounced, query, suggestQuery.data, draftAreas],
  );
  const showList = open && suggestions.length > 0 && !full;

  const add = (raw: string) => {
    const result = addArea(draftAreas, raw);
    if (!result.ok) {
      setMessage(ADD_AREA_MESSAGES[result.reason] || null);
      return;
    }
    onDraftAreasChange(result.areas);
    setText("");
    setMessage(null);
    setActive(-1);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // IME keys choose or confirm a character, not an area. Some WebKit
    // composition-ending Enter events report keyCode 229 instead of isComposing.
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
    if (e.key === "ArrowDown" && suggestions.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" || e.key === ",") {
      if (e.key === "Enter" && !text.trim()) return;
      e.preventDefault();
      add(showList && active >= 0 ? suggestions[active]!.label : text);
    } else if (e.key === "Escape" && showList) {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <article className="profile-page__engage-card profile-areas" aria-labelledby={`${hintId}-title`}>
      <header className="profile-page__engage-card-head">
        <span className="profile-page__engage-card-icon-wrap profile-page__engage-card-icon-wrap--header">
          <IconAreas className="profile-page__engage-card-icon" />
        </span>
        <div className="profile-page__engage-card-head-copy">
          <h2 id={`${hintId}-title`} className="profile-page__engage-card-title">
            Areas of experience
          </h2>
          <p id={hintId} className="profile-page__engage-card-hint">
            What people can ask you about. Ask uses these to find you. ({draftAreas.length}/{PERSON_AREAS_MAX})
          </p>
        </div>
      </header>

      {draftAreas.length > 0 ? (
        <ul className="profile-areas__chips" aria-label="Your areas">
          {draftAreas.map((label) => (
            <li key={label} className="profile-areas__chip">
              <span>{label}</span>
              <button
                type="button"
                className="profile-areas__remove"
                aria-label={`Remove ${label}`}
                onClick={() => {
                  onDraftAreasChange(removeArea(draftAreas, label));
                  setMessage(null);
                  inputRef.current?.focus();
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="profile-areas__field">
        <input
          ref={inputRef}
          id={PROFILE_AREAS_INPUT_ID}
          className="input profile-areas__input"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          aria-describedby={hintId}
          aria-label="Add an area of experience"
          placeholder={full ? `You've added ${PERSON_AREAS_MAX}` : "e.g. Pricing, D2C growth, Supply chain"}
          maxLength={PERSON_AREA_MAX_LENGTH}
          disabled={full}
          value={text}
          autoComplete="off"
          onChange={(e) => {
            setText(e.target.value);
            setMessage(null);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        />
        {text.trim() && !full ? (
          <button type="button" className="profile-areas__add" onClick={() => add(text)}>
            Add
          </button>
        ) : null}
        <ul id={listId} role="listbox" className="profile-areas__suggestions" hidden={!showList} aria-label="Suggested areas">
          {showList
            ? suggestions.map((s, i) => (
                <li
                  key={s.label}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={`profile-areas__suggestion${i === active ? " profile-areas__suggestion--active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add(s.label);
                  }}
                >
                  <span>{s.label}</span>
                  <small>
                    {s.memberCount} {s.memberCount === 1 ? "member" : "members"}
                  </small>
                </li>
              ))
            : null}
        </ul>
      </div>
      {message ? (
        <p className="profile-page__engage-card-hint profile-areas__message" role="status">
          {message}
        </p>
      ) : null}
    </article>
  );
}
