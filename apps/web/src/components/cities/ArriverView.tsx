import { useState } from "react";
import { Link } from "react-router-dom";
import { formatRelativeTime } from "../../lib/formatRelativeTime";
import {
  ALUMNI_PREVIEW,
  CITY_ASK_PENDING_MAX,
  cityPath,
  roleLine,
  batchDeptLine,
  type CityAlum,
  type CityAskMode,
  type CityHelper,
  type CityPayload,
} from "../../lib/cities";
import { Initials } from "./CitySheet";
import { CityAlumRow } from "./CityAlumniList";
import { CityAskComposer } from "./CityNoteSheets";
import { CoffeeAskSheet } from "./CoffeeAskSheet";

function replyStatsLine(h: CityHelper): string | null {
  const s = h.replyStats;
  if (!s) return null;
  const base = `Replied to ${s.replied} of ${s.total} notes`;
  return s.medianDays ? `${base} · usually within ${s.medianDays} ${s.medianDays === 1 ? "day" : "days"}` : base;
}

/**
 * Screen 7: viewing a city you don't live in. Helpers are people open to city help; asks need when + one
 * specific need, and each sender can have 3 waiting at a time. Everyone else is "Ask" (coffee rules) or "View".
 */
export function ArriverView({
  data,
  onAskWall,
  onChanged,
}: {
  data: CityPayload;
  onAskWall: (mode: CityAskMode) => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<CityAskMode>("moving");
  const [askHelper, setAskHelper] = useState<CityHelper | null>(null);
  const [askCoffee, setAskCoffee] = useState<CityAlum | null>(null);
  const city = data.place.city;
  const atLimit = data.pendingCityAsks >= CITY_ASK_PENDING_MAX;
  const thin = data.counts.alumni === 0;
  const searchParams = new URLSearchParams({ residenceCity: city });
  if (data.place.country) searchParams.set("residenceCountry", data.place.country);

  return (
    <>
      <header className="cities__header">
        {data.viewerCity ? (
          <Link to={cityPath(data.viewerCity)} className="cities__back">
            ‹ Your city: {data.viewerCity.city}
          </Link>
        ) : null}
        {/* Counts are temporarily hidden by product choice; keep the data and markup.
        <p className="cities__count">
          {data.counts.alumni} {data.counts.alumni === 1 ? "alum lives" : "alumni live"} here · {data.counts.openToCityHelp} open to city help
        </p>
        */}
      </header>

      {thin ? (
        data.country && data.country.alumni > 0 ? (
          <section className="cities__section" aria-labelledby="cities-thin-title">
            <h2 id="cities-thin-title" className="cities__h2">
              Nobody in {city} yet · {data.country.alumni} in {data.country.name}
            </h2>
            <Link to={`/search?${new URLSearchParams({ residenceCountry: data.country.name }).toString()}`} className="cities__row cities__row--card">
              <span>See alumni in {data.country.name}</span>
              <span aria-hidden>›</span>
            </Link>
          </section>
        ) : (
          <p className="cities__empty">No alumni live in {city} yet.</p>
        )
      ) : (
        <>
          <section className="cities__section" aria-labelledby="cities-brings-title">
            <h1 id="cities-brings-title" className="cities__primary-title">
              What brings you to {city}?
            </h1>
            <div className="cities__segmented" role="radiogroup" aria-labelledby="cities-brings-title">
              {(
                [
                  ["moving", "Moving here"],
                  ["visiting", "Visiting"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={mode === id}
                  className={`cities__segment${mode === id ? " cities__segment--on" : ""}`}
                  onClick={() => setMode(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="cities__section" aria-labelledby="cities-helpers-title">
            <div className="cities__head">
              <h2 id="cities-helpers-title" className="cities__h2">
                Alumni who help people settle in
              </h2>
              <p className="cities__note">They’ve said they’re open to city help</p>
            </div>
            {data.helpers.length === 0 ? (
              <p className="cities__empty">Nobody in {city} has said they’re open to city help yet.</p>
            ) : (
              <ul className="cities__cards">
                {data.helpers.map((h) => {
                  const stats = replyStatsLine(h);
                  return (
                    <li key={h.person.id} className="cities__card">
                      <div className="cities__person">
                        <Initials name={h.person.fullName} />
                        <div className="cities__person-copy">
                          <Link to={`/profiles/${h.person.id}`} className="cities__person-name">
                            {h.person.fullName}
                          </Link>
                          <p className="cities__meta">{[batchDeptLine(h.person), roleLine(h.person)].filter(Boolean).join(" · ")}</p>
                          {h.sharedTag ? <p className="cities__shared">{h.sharedTag}</p> : null}
                          {h.yourCityAsk?.status === "pending" ? (
                            <p className="cities__meta cities__meta--muted">Your note is waiting for a reply</p>
                          ) : stats ? (
                            <p className="cities__meta cities__meta--muted">{stats}</p>
                          ) : null}
                        </div>
                      </div>
                      {h.yourCityAsk?.status === "pending" ? (
                        <p className="cities__status-row">Note sent {formatRelativeTime(h.yourCityAsk.createdAt)}</p>
                      ) : h.yourCityAsk?.status === "accepted" ? (
                        <p className="cities__status-row">
                          <span aria-hidden>✓</span> {h.person.fullName.split(/\s+/)[0]} accepted your note
                        </p>
                      ) : atLimit ? (
                        <button type="button" className="cities__primary" disabled>
                          {CITY_ASK_PENDING_MAX} asks waiting · send more once they reply
                        </button>
                      ) : (
                        <button type="button" className="cities__primary" onClick={() => setAskHelper(h)}>
                          Ask for help
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <aside className="cities__panel cities__helper" aria-labelledby="cities-good-ask">
            <h2 id="cities-good-ask" className="cities__h3">
              What a good ask includes
            </h2>
            <p className="cities__note">
              When you’re {mode === "moving" ? "moving" : "visiting"}, where you’ll {mode === "moving" ? "work" : "stay"}, and one specific
              thing you need: areas to live, commute, flatmates or schools. Your note starts with these filled in for you to edit.
            </p>
          </aside>

          {data.others.length > 0 ? (
            <section className="cities__section" aria-labelledby="cities-others-title">
              <div className="cities__head">
                <h2 id="cities-others-title" className="cities__h2">
                  Others in {city}
                </h2>
                <p className="cities__note">Same batch, department or company as you</p>
              </div>
              <ul className="cities__list">
                {data.others.slice(0, ALUMNI_PREVIEW).map((a) => (
                  <CityAlumRow key={a.person.id} alum={a} onAsk={setAskCoffee} askLabel="Ask" />
                ))}
              </ul>
            </section>
          ) : null}
          <Link to={`/search?${searchParams.toString()}`} className="cities__link">
            See all {data.counts.alumni} alumni in {city}
          </Link>
        </>
      )}

      <button type="button" className="cities__dashed" onClick={() => onAskWall(mode)}>
        Not the right people? Ask everyone on the Wall
      </button>

      {askHelper ? (
        <CityAskComposer person={askHelper.person} city={city} mode={mode} onClose={() => setAskHelper(null)} onSent={onChanged} />
      ) : null}
      {askCoffee ? <CoffeeAskSheet alum={askCoffee} onClose={() => setAskCoffee(null)} onSent={onChanged} /> : null}
    </>
  );
}
