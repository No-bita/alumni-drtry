import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ARRIVALS_PREVIEW,
  arrivedLabel,
  batchDeptLine,
  firstName,
  roleLine,
  withdrawOffer,
  type CityArrival,
} from "../../lib/cities";
import { Initials } from "./CitySheet";
import { OfferHelpSheet } from "./OfferHelpSheet";

/**
 * Screen 1 §3: "New in [city]" — only people who opted in. Collapses entirely when empty.
 * An offer is not a message; after offering, the card says who decides. Never shows whether they read it.
 */
export function NewInCitySection({
  city,
  arrivals,
  total,
  onChanged,
}: {
  city: string;
  arrivals: CityArrival[];
  total: number;
  onChanged: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [offerFor, setOfferFor] = useState<CityArrival | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (arrivals.length === 0) return null;
  const shown = showAll ? arrivals : arrivals.slice(0, ARRIVALS_PREVIEW);

  const withdraw = async (a: CityArrival) => {
    if (!a.myOffer || busyId) return;
    setBusyId(a.id);
    setError(null);
    const res = await withdrawOffer(a.myOffer.id);
    setBusyId(null);
    if (res.error) {
      setError("Couldn’t withdraw your offer. Try again.");
      return;
    }
    onChanged();
  };

  return (
    <section className="cities__section" aria-labelledby="cities-new-title">
      <div className="cities__head">
        <h2 id="cities-new-title" className="cities__h2">
          New in {city}
        </h2>
        <p className="cities__note">Just arrived and happy to be found. Offer help; they choose who to write to.</p>
      </div>
      <ul className="cities__cards">
        {shown.map((a) => {
          const name = firstName(a.person.fullName);
          const meta = [roleLine(a.person), a.previousCity ? `from ${a.previousCity}` : ""].filter(Boolean).join(" · ");
          return (
            <li key={a.id} className="cities__card">
              <div className="cities__person">
                <Initials name={a.person.fullName} />
                <div className="cities__person-copy">
                  <p className="cities__person-name">
                    <Link to={`/profiles/${a.person.id}`}>{a.person.fullName}</Link>{" "}
                    <span className="cities__badge">{arrivedLabel(a.arrivedDaysAgo)}</span>
                  </p>
                  <p className="cities__meta">{batchDeptLine(a.person)}</p>
                  {meta ? <p className="cities__meta cities__meta--muted">{meta}</p> : null}
                </div>
              </div>
              {a.myOffer ? (
                <>
                  <p className="cities__status-row">
                    <span aria-hidden>✓</span> You offered to help · {name} decides
                  </p>
                  {a.wroteToMe ? (
                    <Link to="/notifications" className="cities__link">
                      {name} wrote to you
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="cities__textbtn cities__textbtn--small"
                      disabled={busyId === a.id}
                      onClick={() => void withdraw(a)}
                    >
                      Withdraw offer
                    </button>
                  )}
                </>
              ) : (
                <button type="button" className="cities__primary" onClick={() => setOfferFor(a)}>
                  Offer to help {name}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error ? (
        <p className="cities__error" role="alert">
          {error}
        </p>
      ) : null}
      {total > ARRIVALS_PREVIEW && arrivals.length > ARRIVALS_PREVIEW ? (
        <button type="button" className="cities__textbtn" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `See all ${total} new arrivals`}
        </button>
      ) : null}
      {offerFor ? (
        <OfferHelpSheet
          arrival={offerFor}
          onClose={() => setOfferFor(null)}
          onSent={() => {
            setOfferFor(null);
            onChanged();
          }}
        />
      ) : null}
    </section>
  );
}
