import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ALUMNI_FILTERS,
  ALUMNI_PREVIEW,
  alumTagLine,
  citiesKeys,
  coffeeButton,
  fetchCityAlumni,
  roleLine,
  yy,
  type AlumniFilter,
  type CityAlum,
  type CityRef,
} from "../../lib/cities";
import { trackBetaUsageEvent } from "../../lib/betaAnalytics";
import { Initials } from "./CitySheet";
import { CoffeeAskSheet } from "./CoffeeAskSheet";

/**
 * One person in a Cities list. The action depends on them, never on the viewer's wish to message:
 * open to coffee with room → Ask for coffee; full → disabled "Full this week"; already asked → "Ask sent";
 * not open to coffee → View (profile). There is no message button.
 */
export function CityAlumRow({ alum, onAsk, askLabel = "Ask for coffee" }: { alum: CityAlum; onAsk: (a: CityAlum) => void; askLabel?: string }) {
  const p = alum.person;
  const b = coffeeButton(alum.coffee);
  const tag = alumTagLine(alum);
  useEffect(() => {
    if (b === "full") trackBetaUsageEvent("cities_coffee_full_shown");
  }, [b, p.id]);
  return (
    <li className="cities__alum">
      <Initials name={p.fullName} />
      <div className="cities__person-copy">
        <Link to={`/profiles/${p.id}`} className="cities__person-name">
          {p.fullName}
        </Link>
        <p className="cities__meta">{[yy(p.batchYear), roleLine(p)].filter(Boolean).join(" · ")}</p>
        {tag ? <p className="cities__shared">{tag}</p> : null}
      </div>
      {b === "ask" ? (
        <button type="button" className="cities__outline" onClick={() => onAsk(alum)}>
          {askLabel}
        </button>
      ) : b === "full" ? (
        <button type="button" className="cities__pill" disabled aria-label="Coffee asks full this week, opens Monday">
          Full this week
        </button>
      ) : b === "sent" ? (
        <span className="cities__quiet">Ask sent</span>
      ) : (
        <Link to={`/profiles/${p.id}`} className="cities__quiet-link" aria-label={`View ${p.fullName}’s profile`}>
          View
        </Link>
      )}
    </li>
  );
}

/** Screen 1 §5: "Alumni in [city]" — browse only, with single-select filter chips. */
export function CityAlumniList({
  place,
  initial,
  totalAlumni,
  onChanged,
}: {
  place: CityRef;
  initial: { total: number; items: CityAlum[] };
  totalAlumni: number;
  onChanged: () => void;
}) {
  const [filter, setFilter] = useState<AlumniFilter>("batch");
  const [asking, setAsking] = useState<CityAlum | null>(null);
  const page = useQuery({
    queryKey: citiesKeys.alumni(place.placeId, filter),
    queryFn: ({ signal }) => fetchCityAlumni(place.placeId, filter, null, signal),
    enabled: filter !== "batch",
  });
  const data = filter === "batch" ? initial : page.data;
  const items = (data?.items ?? []).slice(0, ALUMNI_PREVIEW);
  const searchParams = new URLSearchParams({ residenceCity: place.city });
  if (place.country) searchParams.set("residenceCountry", place.country);

  return (
    <section className="cities__section" aria-labelledby="cities-alumni-title">
      <div className="cities__head">
        <h2 id="cities-alumni-title" className="cities__h2">
          Alumni in {place.city}
        </h2>
        <p className="cities__note">Shared batch, department or company first. Coffee asks only go to people open to them.</p>
      </div>
      <div className="cities__filters" role="group" aria-label="Filter alumni">
        {ALUMNI_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`cities__chip${filter === f.id ? " cities__chip--on" : ""}`}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {filter !== "batch" && page.isPending ? (
        <p className="cities__note" role="status">
          Loading…
        </p>
      ) : filter !== "batch" && page.isError ? (
        <p className="cities__note" role="alert">
          Couldn’t load alumni.{" "}
          <button type="button" className="cities__textbtn" onClick={() => void page.refetch()}>
            Try again
          </button>
        </p>
      ) : items.length === 0 ? (
        <p className="cities__empty">Nobody here matches this filter yet. Try another.</p>
      ) : (
        <ul className="cities__list">
          {items.map((a) => (
            <CityAlumRow key={a.person.id} alum={a} onAsk={setAsking} />
          ))}
        </ul>
      )}
      {totalAlumni > 0 ? (
        <Link to={`/search?${searchParams.toString()}`} className="cities__link">
          See all {totalAlumni} {totalAlumni === 1 ? "alum" : "alumni"} in {place.city}
        </Link>
      ) : null}
      {asking ? (
        <CoffeeAskSheet
          alum={asking}
          onClose={() => setAsking(null)}
          onSent={() => {
            onChanged();
          }}
        />
      ) : null}
    </section>
  );
}
