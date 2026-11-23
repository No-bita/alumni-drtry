import { useId, useState } from "react";
import {
  cityNoteError,
  firstName,
  newcomerNotePrefill,
  roleLine,
  sendCityNote,
  yy,
  type CityPerson,
  type NewcomerOffer,
} from "../../lib/cities";
import { CitySheet, Initials } from "./CitySheet";
import { FormActions, FormField } from "../forms";

const NOTE_MIN = 10;
const NOTE_MAX = 3000;

function personSubtitle(p: CityPerson): string {
  return [yy(p.batchYear), roleLine(p)].filter(Boolean).join(" · ");
}

/** Screen 6: the newcomer writes to a local who offered. Sent as a note linked to the offer. */
export function NewcomerNoteSheet({
  offer,
  previousCity,
  onClose,
  onSent,
}: {
  offer: NewcomerOffer;
  previousCity: string | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const noteId = useId();
  const [note, setNote] = useState(() => newcomerNotePrefill(offer.kinds, previousCity));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = firstName(offer.offerer.fullName);
  const tooShort = note.trim().length < NOTE_MIN;

  const send = async () => {
    if (tooShort || busy) return;
    setBusy(true);
    setError(null);
    const res = await sendCityNote({
      recipientPersonId: offer.offerer.id,
      message: note.trim(),
      category: "newcomer",
      cityHelpOfferId: offer.id,
    });
    setBusy(false);
    if (res.error) {
      setError(cityNoteError(res.error.code, name, res.error.message));
      return;
    }
    onSent();
    onClose();
  };

  return (
    <CitySheet
      title={`Write to ${name}`}
      lead={<Initials name={offer.offerer.fullName} />}
      subtitle={personSubtitle(offer.offerer)}
      busy={busy}
      onClose={onClose}
    >
      <div className="cities-sheet__body">
        <FormField label="Your note">
          <textarea
            id={noteId}
            className="cities__textarea"
            rows={5}
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
        <p className="cities__infobox">
          {name} sees your name, batch and this note, and can accept or decline. Contact details are shared only if they accept.
        </p>
        {error ? (
          <p className="cities__error" role="alert">
            {error}
          </p>
        ) : null}
        <FormActions
          secondary={{ label: "Cancel", onClick: onClose, disabled: busy }}
          primary={{ label: busy ? "Sending…" : `Send to ${name}`, disabled: tooShort || busy, onClick: () => void send() }}
        />
      </div>
    </CitySheet>
  );
}
