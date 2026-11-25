import { useState } from "react";
import { api } from "../../api/client";
// import { useAuth } from "../../contexts/AuthContext"; - see the coffee note below
import {
  OPEN_TO_CATALOG,
  OPEN_TO_MAX_SELECTED,
  OPEN_TO_PICKABLE_IDS,
  canSelectMoreOpenTo,
  isOpenToSelected,
  normalizeOpenToPreferences,
  openToPreferencesForEdit,
  toggleOpenToSelection,
  type OpenToPreferences,
} from "../../lib/openToPreferences";
import { AREAS_PROMPT_OPEN_TO } from "../../lib/personAreas";
// Coffee (and its weekly limit) came with Cities, which is out of the product: the coffee limit gate
// and the one-time limit prompt are commented out (restore by uncommenting). Coffee is no longer offered.
// import { useCoffeeLimitGate } from "../cities/useCoffeeLimitGate";
import { OpenToIcon } from "./OpenToIcon";
import { ProfileSheet } from "./ProfileSheet";

/** Members who had coffee on before weekly limits: the limit sheet shows once in the editor. */
// const COFFEE_LIMIT_SEEN_FLAG = "coffeeLimitSheetSeen";

type Props = {
  saved: OpenToPreferences | null;
  /** Unsaved ticks to start from, e.g. after the "Add areas" detour. */
  initialDraft?: OpenToPreferences | null;
  /** One line above the list, e.g. why Cities sent the member here. */
  notice?: string | null;
  /** The member has no areas yet: turning on referrals, mentorship or advising suggests adding some. */
  hasAreas: boolean;
  /** Detour to the Areas sheet; gets the current ticks so they can be restored on the way back. */
  onAddAreas: (draft: OpenToPreferences) => void;
  onClose: () => void;
  onSaved: () => void;
};

/** Choose up to five ways you're open to helping. */
export function OpenToSheet({ saved, initialDraft = null, notice = null, hasAreas, onAddAreas, onClose, onSaved }: Props) {
  // const auth = useAuth(); - only the commented-out coffee limit prompt used the person id
  // const personId = auth.status === "authenticated" ? auth.person.personId : null;
  const [draft, setDraft] = useState<OpenToPreferences>(() => initialDraft ?? openToPreferencesForEdit(saved));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // const gate = useCoffeeLimitGate(draft, setDraft);
  // const legacyShown = useRef(false);
  // const { changeLimit } = gate;
  //
  // useEffect(() => {
  //   if (!coffeeNeedsLimit(draft) || legacyShown.current || !personId) return;
  //   legacyShown.current = true;
  //   if (readFlag(personId, COFFEE_LIMIT_SEEN_FLAG)) return;
  //   writeFlag(personId, COFFEE_LIMIT_SEEN_FLAG);
  //   changeLimit();
  // }, [draft, personId, changeLimit]);

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
          <button type="button" className="pp-inline-link" onClick={() => onAddAreas(draft)}>
            Add areas
          </button>
        </p>
      ) : null}
      <ul className="pp-opento-edit">
        {OPEN_TO_PICKABLE_IDS.map((id) => {
          const selected = isOpenToSelected(draft, id);
          const atLimit = !selected && !canSelectMoreOpenTo(draft);
          return (
            <li key={id} className={`pp-opento-edit__item${atLimit ? " pp-opento-edit__item--disabled" : ""}`}>
              <label className="pp-opento-edit__toggle">
                <input type="checkbox" checked={selected} disabled={atLimit} onChange={() => setDraft(toggleOpenToSelection(draft, id))} />
                <OpenToIcon kind={id} className="pp-opento-edit__icon" />
                <span>{OPEN_TO_CATALOG[id].title}</span>
              </label>
              {/* Coffee's weekly limit line (Cities out of the product; coffee is no longer listed).
              {id === "coffee" && selected ? (
                <p className="pp-opento-edit__hint">
                  {coffeeLimitOf(draft)} a week ·{" "}
                  <button type="button" className="pp-inline-link" onClick={gate.changeLimit}>
                    Change
                  </button>
                </p>
              ) : null} */}
            </li>
          );
        })}
      </ul>
      {/* {gate.sheet} */}
    </ProfileSheet>
  );
}
