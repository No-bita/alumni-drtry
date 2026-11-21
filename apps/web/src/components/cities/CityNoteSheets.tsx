import { useId, useState } from "react";
import { api } from "../../api/client";
import { BULLETIN_REPLY_MAX_LENGTH } from "../../constants/bulletin";
import {
  CITY_NEEDS,
  cityAskMessage,
  cityAskStarter,
  cityNoteError,
  firstName,
  newcomerNotePrefill,
  nextMonths,
  roleLine,
  sendCityNote,
  yy,
  type CityAskMode,
  type CityNeed,
  type CityPerson,
  type CityPost,
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

/** Screen 7: an arriver asks a local who is open to city help. When and one specific need are required. */
export function CityAskComposer({
  person,
  city,
  mode,
  onClose,
  onSent,
}: {
  person: CityPerson;
  city: string;
  mode: CityAskMode;
  onClose: () => void;
  onSent: () => void;
}) {
  const whenId = useId();
  const otherId = useId();
  const noteId = useId();
  const months = nextMonths();
  const [when, setWhen] = useState(mode === "moving" ? (months[0] ?? "") : "");
  const [need, setNeed] = useState<CityNeed | null>(null);
  const [otherNeed, setOtherNeed] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = firstName(person.fullName);

  const needOk = need !== null && (need !== "Other" || otherNeed.trim().length >= 3);
  const whenOk = when.trim().length > 0;
  const starter = need ? cityAskStarter({ mode, city, when, need, otherNeed }) : "";
  const body = touched ? note : starter;
  const ready = needOk && whenOk && body.trim().length >= NOTE_MIN;

  const send = async () => {
    if (!ready || busy || !need) return;
    setBusy(true);
    setError(null);
    const res = await sendCityNote({
      recipientPersonId: person.id,
      message: cityAskMessage({ mode, when, need, otherNeed, note: body }),
      category: mode === "moving" ? "relocation" : "visiting",
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
    <CitySheet title={`Ask ${name} for help`} lead={<Initials name={person.fullName} />} subtitle={personSubtitle(person)} busy={busy} onClose={onClose}>
      <div className="cities-sheet__body">
        <FormField label={mode === "moving" ? "When are you moving?" : "When are you visiting?"} required>
          {mode === "moving" ? (
            <select id={whenId} className="cities__input" value={when} onChange={(e) => setWhen(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={whenId}
              className="cities__input"
              value={when}
              maxLength={80}
              placeholder="e.g. 12–15 Nov"
              onChange={(e) => setWhen(e.target.value)}
            />
          )}
        </FormField>
        <fieldset className="cities__fieldset">
          <legend className="cities__label">
            One thing you need <span className="cities__optional">(required)</span>
          </legend>
          <div className="cities__chips">
            {CITY_NEEDS.map((n) => (
              <button
                key={n}
                type="button"
                className={`cities__chip${need === n ? " cities__chip--on" : ""}`}
                aria-pressed={need === n}
                onClick={() => setNeed(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>
        {need === "Other" ? (
          <FormField label="What do you need?">
            <input id={otherId} className="cities__input" maxLength={80} value={otherNeed} onChange={(e) => setOtherNeed(e.target.value)} />
          </FormField>
        ) : null}
        {need ? (
          <FormField label="Your note">
            <textarea
              id={noteId}
              className="cities__textarea"
              rows={4}
              maxLength={NOTE_MAX - 200}
              value={body}
              onChange={(e) => {
                setTouched(true);
                setNote(e.target.value);
              }}
            />
          </FormField>
        ) : null}
        <p className="cities__infobox">
          {name} sees your name, batch and this note, and can accept or decline. Your contact details are shared only if they accept.
        </p>
        {error ? (
          <p className="cities__error" role="alert">
            {error}
          </p>
        ) : null}
        <FormActions
          secondary={{ label: "Cancel", onClick: onClose, disabled: busy }}
          primary={{ label: busy ? "Sending…" : "Send ask", disabled: !ready || busy, onClick: () => void send() }}
        />
      </div>
    </CitySheet>
  );
}

/** "Reply to [name]" on a city meetup post: the existing private Wall reply (only the author sees it). */
export function CityReplySheet({ post, onClose, onSent }: { post: CityPost; onClose: () => void; onSent: () => void }) {
  const replyId = useId();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = firstName(post.authorFullName);
  const ok = msg.trim().length >= 5;

  const send = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await api.post(`/v1/intentcasts/${encodeURIComponent(post.id)}/respond`, { message: msg.trim() });
    setBusy(false);
    if (err && err.code !== "INTENTCAST_ALREADY_RESPONDED") {
      setError(err.code === "DEMO_READ_ONLY" ? "Demo accounts can’t reply." : (err.message ?? "Couldn’t send. Try again."));
      return;
    }
    onSent();
    onClose();
  };

  return (
    <CitySheet title={`Reply to ${name}`} subtitle="Only they see your reply." busy={busy} onClose={onClose}>
      <div className="cities-sheet__body">
        <blockquote className="cities__quote">{post.content}</blockquote>
        <FormField label="Your reply">
          <textarea
            id={replyId}
            className="cities__textarea"
            rows={4}
            maxLength={BULLETIN_REPLY_MAX_LENGTH}
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
          />
        </FormField>
        {error ? (
          <p className="cities__error" role="alert">
            {error}
          </p>
        ) : null}
        <FormActions
          secondary={{ label: "Cancel", onClick: onClose, disabled: busy }}
          primary={{ label: busy ? "Sending…" : "Send reply", disabled: !ok || busy, onClick: () => void send() }}
        />
      </div>
    </CitySheet>
  );
}
