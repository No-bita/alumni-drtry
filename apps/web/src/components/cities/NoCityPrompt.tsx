import { useId, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { AUTH_SESSION_QUERY_KEY } from "../../lib/authSessionQuery";
import {
  CITIES_KEY,
  citiesKeys,
  cityPath,
  searchCities,
  type ArrivalPrompt,
  type CityListItem,
  type CityRef,
  type ProfilePatchResponse,
} from "../../lib/cities";

const TOP_CITIES = 4;

/** Screen 8: no city on the profile. Save one (canonical places only), or browse a city as an arriver. */
export function NoCityPrompt({
  cities,
  onOpenAll,
  onSaved,
}: {
  cities: CityListItem[];
  onOpenAll: () => void;
  onSaved: (place: CityRef, prompt: ArrivalPrompt | null) => void;
}) {
  const queryClient = useQueryClient();
  const inputId = useId();
  const listId = useId();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<CityRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const term = q.trim();
  const suggestions = useQuery({
    queryKey: citiesKeys.search(term),
    queryFn: ({ signal }) => searchCities(term, signal),
    enabled: term.length >= 2 && !picked,
  });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const place = picked ?? suggestions.data?.find((p) => p.city.toLowerCase() === term.toLowerCase()) ?? null;
    if (!place || busy) {
      if (!place) setError("Pick your city from the list.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await api.patch<ProfilePatchResponse>("/v1/me/profile", {
      residenceCity: place.city,
      residenceCountry: place.country,
    });
    setBusy(false);
    if (res.error) {
      setError(res.error.code === "DEMO_READ_ONLY" ? "Demo accounts can’t save changes." : "Couldn’t save. Try again.");
      return;
    }
    void queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: CITIES_KEY });
    onSaved(place, res.data?.arrivalPrompt ?? null);
  };

  const options = picked ? [] : (suggestions.data ?? []);

  return (
    <>
      <form className="cities__card cities__where" onSubmit={(e) => void save(e)}>
        <h2 className="cities__where-title">Where do you live?</h2>
        <p className="cities__lede">We’ll show you alumni nearby, who’s new in town and who’s asking about your city.</p>
        <label htmlFor={inputId} className="cities__label">
          City
        </label>
        <input
          id={inputId}
          className="cities__input"
          value={picked ? `${picked.city}, ${picked.country}` : q}
          placeholder="e.g. Bengaluru"
          autoComplete="off"
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={(e) => {
            setPicked(null);
            setQ(e.target.value);
          }}
        />
        {options.length > 0 ? (
          <ul id={listId} role="listbox" className="cities__suggestions">
            {options.map((p) => (
              <li key={p.placeId} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(p);
                    setError(null);
                  }}
                >
                  {p.city}, {p.country}
                </button>
              </li>
            ))}
          </ul>
        ) : term.length >= 2 && !picked && suggestions.isSuccess ? (
          <p className="cities__hint">No match yet. Try another spelling, or add it on your profile.</p>
        ) : null}
        {error ? (
          <p className="cities__error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="cities__primary" disabled={busy || (!picked && term.length < 2)}>
          {busy ? "Saving…" : "Save to my profile"}
        </button>
      </form>

      <section className="cities__section" aria-labelledby="cities-browse-title">
        <div className="cities__head">
          <h2 id="cities-browse-title" className="cities__h2">
            Or browse a city
          </h2>
          <p className="cities__note">Alumni living in each</p>
        </div>
        <ul className="cities__rows">
          {cities.slice(0, TOP_CITIES).map((c) => (
            <li key={c.placeId}>
              <Link to={cityPath(c)} className="cities__row">
                <span className="cities__row-title">{c.city}</span>
                <span className="cities__meta">{c.count}</span>
              </Link>
            </li>
          ))}
          <li>
            <button type="button" className="cities__row cities__row--button" onClick={onOpenAll}>
              <span className="cities__row-title">See all cities</span>
              <span aria-hidden>›</span>
            </button>
          </li>
        </ul>
      </section>
    </>
  );
}
