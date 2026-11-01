import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { cityPath, type CityListItem, type CityRef } from "../../lib/cities";
import { CitySheet } from "./CitySheet";

/** "All cities": every city with alumni, live counts, your own city first. */
export function CitySwitcherSheet({
  cities,
  viewerCity,
  currentPlaceId,
  onClose,
}: {
  cities: CityListItem[];
  viewerCity: CityRef | null;
  currentPlaceId: string | null;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t ? cities.filter((c) => `${c.city} ${c.country}`.toLowerCase().includes(t)) : cities;
    if (!viewerCity) return list;
    return [...list].sort((a, b) => Number(b.placeId === viewerCity.placeId) - Number(a.placeId === viewerCity.placeId));
  }, [cities, q, viewerCity]);

  return (
    <CitySheet title="All cities" onClose={onClose}>
      <div className="cities-sheet__body">
        <label className="cities__label" htmlFor="cities-switcher-filter">
          Find a city
        </label>
        <input
          id="cities-switcher-filter"
          className="cities__input"
          value={q}
          placeholder="e.g. Pune"
          onChange={(e) => setQ(e.target.value)}
        />
        {filtered.length === 0 ? (
          <p className="cities__empty">No alumni live in a city by that name yet.</p>
        ) : (
          <ul className="cities__rows cities__rows--scroll">
            {filtered.map((c) => (
              <li key={c.placeId}>
                <Link
                  to={cityPath(c)}
                  className={`cities__row${c.placeId === currentPlaceId ? " cities__row--current" : ""}`}
                  aria-current={c.placeId === currentPlaceId ? "page" : undefined}
                  onClick={onClose}
                >
                  <span className="cities__row-title">
                    {c.city}
                    {viewerCity?.placeId === c.placeId ? <span className="cities__meta"> · your city</span> : null}
                  </span>
                  <span className="cities__meta">
                    {c.count} {c.count === 1 ? "alum" : "alumni"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </CitySheet>
  );
}
