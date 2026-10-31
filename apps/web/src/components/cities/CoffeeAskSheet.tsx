import { useId, useState } from "react";
import {
  COFFEE_REASON_MAX,
  COFFEE_REASON_MIN,
  WHEN_SUITS,
  coffeeAskMessage,
  cityNoteError,
  firstName,
  roleLine,
  sendCityNote,
  yy,
  type CityAlum,
  type WhenSuits,
} from "../../lib/cities";
import { CitySheet, Initials } from "./CitySheet";

/** Screen 3: ask for coffee. A reason is required; the recipient's weekly limit is checked again on send. */
export function CoffeeAskSheet({ alum, onClose, onSent }: { alum: CityAlum; onClose: () => void; onSent: () => void }) {
  const reasonId = useId();
  const hintId = useId();
  const [reason, setReason] = useState("");
  const [when, setWhen] = useState<WhenSuits | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const p = alum.person;
  const name = firstName(p.fullName);
  const limit = alum.coffee.limit ?? 0;
  const left = alum.coffee.spotsLeft ?? 0;
  const tooShort = reason.trim().length < COFFEE_REASON_MIN;

  const send = async () => {
    if (tooShort || busy) return;
    setBusy(true);
    setError(null);
    const res = await sendCityNote({ recipientPersonId: p.id, message: coffeeAskMessage(reason, when), category: "coffee" });
    setBusy(false);
    if (res.error) {
      setError(cityNoteError(res.error.code, name, res.error.message));
      return;
    }
    setSent(true);
    onSent();
  };

  return (
    <CitySheet
      title={sent ? "Ask sent" : `Ask ${name} for coffee`}
      lead={<Initials name={p.fullName} />}
      subtitle={[yy(p.batchYear), roleLine(p)].filter(Boolean).join(" · ")}
      busy={busy}
      onClose={onClose}
    >
      {sent ? (
        <div className="cities-sheet__body">
          <p className="cities__lede">
            {name} sees your note and can accept or decline. If they accept, you’ll get their contact details.
          </p>
          <button type="button" className="cities__primary" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <div className="cities-sheet__body">
          <p className="cities__capacity">
            {name} takes {limit} coffee {limit === 1 ? "ask" : "asks"} a week · {left} {left === 1 ? "spot" : "spots"} left
          </p>
          <label htmlFor={reasonId} className="cities__label">
            Why {name}? <span className="cities__optional">(required)</span>
          </label>
          <textarea
            id={reasonId}
            className="cities__textarea"
            rows={4}
            maxLength={COFFEE_REASON_MAX}
            value={reason}
            aria-describedby={hintId}
            onChange={(e) => setReason(e.target.value)}
          />
          <p id={hintId} className="cities__hint">
            Say what you share or what you’d like to learn. At least {COFFEE_REASON_MIN} characters.
          </p>
          <fieldset className="cities__fieldset">
            <legend className="cities__label">When suits you</legend>
            <div className="cities__chips">
              {WHEN_SUITS.map((w) => (
                <button
                  key={w}
                  type="button"
                  className={`cities__chip${when === w ? " cities__chip--on" : ""}`}
                  aria-pressed={when === w}
                  onClick={() => setWhen((cur) => (cur === w ? null : w))}
                >
                  {w}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="cities__infobox">
            {name} sees your name, batch and this note. Your contact details are shared only if they accept.
          </p>
          {error ? (
            <p className="cities__error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="button" className="cities__primary" disabled={tooShort || busy} onClick={() => void send()}>
            {busy ? "Sending…" : "Send ask"}
          </button>
          <button type="button" className="cities__textbtn cities__textbtn--center" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      )}
    </CitySheet>
  );
}
