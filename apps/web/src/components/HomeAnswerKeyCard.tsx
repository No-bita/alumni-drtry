import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { ANSWER_KEY_EXAMPLES, ANSWER_KEY_ORDER } from "../lib/answerKey";
import { AUTH_SESSION_QUERY_KEY } from "../lib/authSessionQuery";
import { readFlag, writeFlag } from "../lib/onboardingChecklist";
import {
  OPEN_TO_CATALOG,
  OPEN_TO_MAX_SELECTED,
  canSelectMoreOpenTo,
  createEmptyOpenToPreferences,
  isOpenToSelected,
  normalizeOpenToPreferences,
  parseOpenToPreferences,
  toggleOpenToSelection,
} from "../lib/openToPreferences";
import { queryKeys } from "../lib/queryKeys";
import { trackBetaUsageEvent } from "../lib/betaAnalytics";
import "../styles/home-answer-key.css";

const DISMISS_FLAG = "answerKeyDismissed";

/** Home nudge for members with no Open-to tags: pick what you'll help with, right here. */
export function HomeAnswerKeyCard() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const personId = auth.status === "authenticated" ? auth.person.personId : null;
  const profile = auth.status === "authenticated" ? auth.myProfile : null;

  const [dismissed, setDismissed] = useState(() => (personId ? readFlag(personId, DISMISS_FLAG) : false));
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(createEmptyOpenToPreferences);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!personId || !profile || dismissed) return null;
  if (!profile.profileCompletedAt) return null;
  const hasAnswerKey = parseOpenToPreferences(profile.openToPreferences) !== null;
  if (hasAnswerKey && !saved) return null;

  if (saved) {
    return (
      <section className="home-answer-key home-answer-key--done" aria-live="polite">
        <p className="home-answer-key__title">Answer key saved.</p>
        <p className="home-answer-key__copy">You can change this on your profile.</p>
      </section>
    );
  }

  const dismiss = () => {
    trackBetaUsageEvent("home_answer_key_dismissed");
    writeFlag(personId, DISMISS_FLAG);
    setDismissed(true);
  };

  const save = async () => {
    if (draft.selected.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    const { error: err } = await api.patch("/v1/me/profile", {
      openToPreferences: normalizeOpenToPreferences(draft),
    });
    setSaving(false);
    if (err) {
      setError(err.code === "DEMO_READ_ONLY" ? "Demo accounts can’t save changes." : "Couldn’t save. Try again.");
      return;
    }
    setSaved(true);
    void queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: queryKeys.me.all });
  };

  const full = !canSelectMoreOpenTo(draft);

  return (
    <section className="home-answer-key" aria-labelledby="home-answer-key-title">
      <div className="home-answer-key__head">
        <div>
          <h2 id="home-answer-key-title" className="home-answer-key__title">
            Be someone’s answer key
          </h2>
          <p className="home-answer-key__copy">
            Choose what you can help with. It shows on your card when a search matches you.
          </p>
        </div>
        {!open ? (
          <div className="home-answer-key__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                trackBetaUsageEvent("home_answer_key_opened");
                setOpen(true);
              }}
            >
              Choose what you’ll help with
            </button>
            <button type="button" className="home-answer-key__dismiss" onClick={dismiss}>
              Not now
            </button>
          </div>
        ) : null}
      </div>

      {open ? (
        <>
          <p className="home-answer-key__hint">Pick up to {OPEN_TO_MAX_SELECTED}.</p>
          <ul className="home-answer-key__options">
            {ANSWER_KEY_ORDER.map((id) => {
              const selected = isOpenToSelected(draft, id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    className={`home-answer-key__option${selected ? " home-answer-key__option--selected" : ""}`}
                    aria-pressed={selected}
                    disabled={!selected && full}
                    onClick={() => setDraft((d) => toggleOpenToSelection(d, id))}
                  >
                    <span className="home-answer-key__option-title">{OPEN_TO_CATALOG[id].title}</span>
                    <span className="home-answer-key__option-example">{ANSWER_KEY_EXAMPLES[id]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {error ? (
            <p className="home-answer-key__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="home-answer-key__actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={draft.selected.length === 0 || saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : `Save (${draft.selected.length}/${OPEN_TO_MAX_SELECTED})`}
            </button>
            <button type="button" className="home-answer-key__dismiss" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
