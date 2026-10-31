import { useId, useState } from "react";
import {
  HELP_KINDS,
  HELP_KIND_LABELS,
  OFFER_LINE_MAX,
  firstName,
  sendOffer,
  yy,
  type CityArrival,
  type HelpKind,
} from "../../lib/cities";
import { CitySheet, Initials } from "./CitySheet";

function offerError(code: string | undefined): string {
  switch (code) {
    case "OFFER_DUPLICATE":
      return "You’ve already offered to help.";
    case "OFFER_NOT_FOUND":
      return "They’re no longer shown as new in town.";
    case "OFFER_NOT_LOCAL":
      return "Only alumni who live here can offer help.";
    case "DEMO_READ_ONLY":
      return "Demo accounts can’t send offers.";
    default:
      return "Couldn’t send your offer. Try again.";
  }
}

/** Screen 2: a local offers help to a newcomer. Not a message: the newcomer decides whether to write. */
export function OfferHelpSheet({
  arrival,
  onClose,
  onSent,
}: {
  arrival: CityArrival;
  onClose: () => void;
  onSent: () => void;
}) {
  const lineId = useId();
  const [line, setLine] = useState("");
  const [kinds, setKinds] = useState<HelpKind[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = firstName(arrival.person.fullName);
  const days = arrival.arrivedDaysAgo;
  const ago = days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;

  const toggle = (k: HelpKind) => setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const send = async () => {
    if (kinds.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    const ordered = HELP_KINDS.filter((k) => kinds.includes(k));
    const res = await sendOffer(arrival.id, ordered, line);
    setBusy(false);
    if (res.error) {
      setError(offerError(res.error.code));
      return;
    }
    onSent();
  };

  return (
    <CitySheet
      title={`Offer to help ${name}`}
      lead={<Initials name={arrival.person.fullName} />}
      subtitle={[yy(arrival.person.batchYear), arrival.previousCity ? `arrived from ${arrival.previousCity} ${ago}` : `arrived ${ago}`]
        .filter(Boolean)
        .join(" · ")}
      busy={busy}
      onClose={onClose}
    >
      <div className="cities-sheet__body">
        <label htmlFor={lineId} className="cities__label">
          One line about you <span className="cities__optional">(optional)</span>
        </label>
        <textarea
          id={lineId}
          className="cities__textarea"
          rows={3}
          maxLength={OFFER_LINE_MAX}
          value={line}
          placeholder="e.g. Six years in Bengaluru, live in HSR and work in Koramangala."
          onChange={(e) => setLine(e.target.value)}
        />
        <p className="cities__hint">Shown with your offer. {OFFER_LINE_MAX} characters.</p>

        <fieldset className="cities__fieldset">
          <legend className="cities__label">What you can help with</legend>
          <div className="cities__chips">
            {HELP_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={`cities__chip${kinds.includes(k) ? " cities__chip--on" : ""}`}
                aria-pressed={kinds.includes(k)}
                onClick={() => toggle(k)}
              >
                {HELP_KIND_LABELS[k]}
              </button>
            ))}
          </div>
        </fieldset>

        <p className="cities__infobox">
          No message is sent. {name} sees your offer and decides whether to write to you. If they do, it arrives as a note you can
          accept or decline.
        </p>
        {error ? (
          <p className="cities__error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="button" className="cities__primary" disabled={kinds.length === 0 || busy} onClick={() => void send()}>
          {busy ? "Sending…" : "Send offer"}
        </button>
        <button type="button" className="cities__textbtn cities__textbtn--center" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </CitySheet>
  );
}
