import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { readFlag, writeFlag } from "../../lib/onboardingChecklist";
import {
  OPEN_TO_CATALOG,
  OPEN_TO_MAX_SELECTED,
  OPEN_TO_OPTION_IDS,
  canSelectMoreOpenTo,
  coffeeLimitOf,
  coffeeNeedsLimit,
  isOpenToSelected,
  normalizeOpenToPreferences,
  openToPreferencesForEdit,
  type OpenToPreferences,
} from "../../lib/openToPreferences";
import { AREAS_PROMPT_OPEN_TO } from "../../lib/personAreas";
import { useCoffeeLimitGate } from "../cities/useCoffeeLimitGate";
import { OpenToIcon } from "./OpenToIcon";
import { ProfileSheet } from "./ProfileSheet";

/** Members who had coffee on before weekly limits: the limit sheet shows once in the editor. */
const COFFEE_LIMIT_SEEN_FLAG = "coffeeLimitSheetSeen";

type Props = {
  saved: OpenToPreferences | null;
  /** One line above the list, e.g. why Cities sent the member here. */
  notice?: string | null;
  /** The member has no areas yet: turning on referrals, mentorship or advising suggests adding some. */
  hasAreas: boolean;
  onAddAreas: () => void;
  onClose: () => void;
  onSaved: () => void;
};

/** Choose up to five ways you're open to helping. Coffee asks for a weekly limit. */
export function OpenToSheet({ saved, notice = null, hasAreas, onAddAreas, onClose, onSaved }: Props) {
  const auth = useAuth();
  const personId = auth.status === "authenticated" ? auth.person.personId : null;
  const [draft, setDraft] = useState<OpenToPreferences>(() => openToPreferencesForEdit(saved));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gate = useCoffeeLimitGate(draft, setDraft);
  const legacyShown = useRef(false);
  const { changeLimit } = gate;

  useEffect(() => {
    if (!coffeeNeedsLimit(draft) || legacyShown.current || !personId) return;
    legacyShown.current = true;
    if (readFlag(personId, COFFEE_LIMIT_SEEN_FLAG)) return;
    writeFlag(personId, COFFEE_LIMIT_SEEN_FLAG);
    changeLimit();
  }, [draft, personId, changeLimit]);

  const save = async () => {
    setSaving(true);
    setError(null);
    // No tags selected = clear them (the API rejects an empty selection object).
    const { error: err } = await api.patch("/v1/me/profile", {
      openToPreferences: draft.selected.length > 0 ? normalizeOpenToPreferences(draft) : null,
    });
    setSaving(false);
    if (err) {
      setError(err.message ?? err.code);
      return;
    }
    onSaved();
  };

  const showAreasPrompt =
    !hasAreas && draft.selected.some((tag) => (AREAS_PROMPT_OPEN_TO as readonly string[]).includes(tag));

  return (
    <ProfileSheet
      title="Open to helping with"
      description={`Choose up to ${OPEN_TO_MAX_SELECTED} (${draft.selected.length}/${OPEN_TO_MAX_SELECTED} selected).`}
      onClose={onClose}
      onSave={save}
      saving={saving}
      error={error}
    >
      {notice ? (
        <p className="pp-sheet__notice" role="status">
          {notice}
        </p>
      ) : null}
      {showAreasPrompt ? (
        <p className="pp-sheet__notice">
          Add your areas of experience so the right people find you.{" "}
          <button type="button" className="pp-inline-link" onClick={onAddAreas}>
            Add areas
          </button>
        </p>
      ) : null}
      <ul className="pp-opento-edit">
        {OPEN_TO_OPTION_IDS.map((id) => {
          const selected = isOpenToSelected(draft, id);
          const atLimit = !selected && !canSelectMoreOpenTo(draft);
          return (
            <li key={id} className={`pp-opento-edit__item${atLimit ? " pp-opento-edit__item--disabled" : ""}`}>
              <label className="pp-opento-edit__toggle">
                <input type="checkbox" checked={selected} disabled={atLimit} onChange={() => gate.toggle(id)} />
                <OpenToIcon kind={id} className="pp-opento-edit__icon" />
                <span>{OPEN_TO_CATALOG[id].title}</span>
              </label>
              {id === "coffee" && selected ? (
                <p className="pp-opento-edit__hint">
                  {coffeeLimitOf(draft)} a week ·{" "}
                  <button type="button" className="pp-inline-link" onClick={gate.changeLimit}>
                    Change
                  </button>
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {gate.sheet}
    </ProfileSheet>
  );
}
