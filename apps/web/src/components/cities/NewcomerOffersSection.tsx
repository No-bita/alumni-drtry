import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatRelativeTime } from "../../lib/formatRelativeTime";
import {
  HELP_KIND_LABELS,
  batchDeptLine,
  firstName,
  markOffersSeen,
  roleLine,
  type NewcomerOffer,
  type NoteStatus,
} from "../../lib/cities";
import { Initials } from "./CitySheet";
import { NewcomerNoteSheet } from "./CityNoteSheets";

const NOTE_STATUS: Record<NoteStatus, string> = { pending: "waiting for a reply", accepted: "accepted", declined: "declined" };

/** Screen 6: offers as they arrive. Unseen offers are marked seen once this section renders. */
export function NewcomerOffersSection({
  offers,
  previousCity,
  onChanged,
}: {
  offers: NewcomerOffer[];
  previousCity: string | null;
  onChanged: () => void;
}) {
  const [writeTo, setWriteTo] = useState<NewcomerOffer | null>(null);
  // Remember which offers were new on first render, so the gold border stays while the page is open.
  const [freshIds] = useState(() => new Set(offers.filter((o) => !o.seen).map((o) => o.id)));
  const marked = useRef(false);
  const hasUnseen = offers.some((o) => !o.seen);

  useEffect(() => {
    if (!hasUnseen || marked.current) return;
    marked.current = true;
    void markOffersSeen();
  }, [hasUnseen]);

  return (
    <section className="cities__section" aria-labelledby="cities-offers-title">
      <div className="cities__head">
        <h2 id="cities-offers-title" className="cities__h2">
          {offers.length === 0
            ? "No offers yet"
            : `${offers.length} ${offers.length === 1 ? "alum" : "alumni"} offered to help`}
        </h2>
        <p className="cities__note">
          {offers.length === 0
            ? "Local alumni see you under New in town. Each offer shows up here as it arrives."
            : "Write to whoever fits. Nobody is waiting on you."}
        </p>
      </div>
      {offers.length > 0 ? (
        <ul className="cities__cards">
          {offers.map((o) => {
            const fresh = freshIds.has(o.id) || !o.seen;
            const name = firstName(o.offerer.fullName);
            return (
              <li key={o.id} className={`cities__card${fresh ? " cities__card--new" : ""}`}>
                <div className="cities__person">
                  <Initials name={o.offerer.fullName} />
                  <div className="cities__person-copy">
                    <p className="cities__person-name">
                      <Link to={`/profiles/${o.offerer.id}`}>{o.offerer.fullName}</Link>{" "}
                      {fresh ? <span className="cities__badge">New · {formatRelativeTime(o.createdAt)}</span> : null}
                    </p>
                    <p className="cities__meta">{[batchDeptLine(o.offerer), roleLine(o.offerer)].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
                {o.line ? <p className="cities__offer-line">“{o.line}”</p> : null}
                <div className="cities__tags">
                  {o.kinds.map((k) => (
                    <span key={k} className="cities__tag">
                      {HELP_KIND_LABELS[k]}
                    </span>
                  ))}
                </div>
                {o.myNote ? (
                  <p className="cities__status-row">
                    <span aria-hidden>✓</span> You wrote to {name} · {NOTE_STATUS[o.myNote.status]}
                  </p>
                ) : (
                  <button type="button" className="cities__primary" onClick={() => setWriteTo(o)}>
                    Write to {name}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {writeTo ? (
        <NewcomerNoteSheet offer={writeTo} previousCity={previousCity} onClose={() => setWriteTo(null)} onSent={onChanged} />
      ) : null}
    </section>
  );
}
