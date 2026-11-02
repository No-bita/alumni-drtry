import { useId, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { AUTH_SESSION_QUERY_KEY } from "../../lib/authSessionQuery";
import { RESIDENCE_COUNTRY_NAMES } from "../../lib/countries";
import {
  CITIES_KEY,
  citiesKeys,
  cityPath,
  type ArrivalPrompt,
  type CityListItem,
  type ProfilePatchResponse,
  type SavedResidence,
} from "../../lib/cities";

const TOP_CITIES = 4;
/** Same limit as PATCH /v1/me/profile (residenceCity / residenceCountry). */
const RESIDENCE_MAX = 120;

/** What happened to a save, in member-facing words. Network and server failures are errors, never success. */
function saveErrorMessage(code: string | undefined): string {
  if (code === "DEMO_READ_ONLY") return "Demo accounts can’t save changes.";
  if (code === "NETWORK_ERROR") return "Couldn’t save: check your connection and try again.";
  return "Couldn’t save. Try again.";
}

/**
 * Type the city you live in and save it to your profile. No suggestions and no list to pick from:
 * matching spellings, duplicates and unfamiliar names are handled behind the scenes. The country you
 * already saved is reused; it is asked for only when your profile doesn't have one.
 */
export function NoCityPrompt({
  cities,
  saved,
  onOpenAll,
  onSaved,
  onCancel,
}: {
  cities: CityListItem[];
  /** What the profile already has (to correct a saved entry, or to reuse its country). */
  saved: SavedResidence | null;
  onOpenAll: () => void;
  onSaved: (prompt: ArrivalPrompt | null) => void;
  /** Shown when correcting a saved entry: back to it without saving. */
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const cityId = useId();
  const countryId = useId();
  const countryListId = useId();
  const errorId = useId();
  const savedCountry = saved?.country?.trim() ? saved.country.trim() : null;
  const [city, setCity] = useState(saved?.city ?? "");
  const [askCountry, setAskCountry] = useState(savedCountry === null);
  const [country, setCountry] = useState(savedCountry ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: "city" | "country" | null; text: string } | null>(null);
  const correcting = Boolean(onCancel);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const cityText = city.trim();
    const countryText = (askCountry ? country : (savedCountry ?? "")).trim();
    if (!cityText) {
      setError({ field: "city", text: "Type the city you live in." });
      return;
    }
    if (!countryText) {
      setError({ field: "country", text: "Add the country too." });
      return;
    }
    setBusy(true);
    setError(null);
    const res = await api.patch<ProfilePatchResponse>("/v1/me/profile", {
      residenceCity: cityText,
      residenceCountry: countryText,
    });
    if (res.error || res.aborted) {
      setBusy(false);
      setError({ field: null, text: saveErrorMessage(res.error?.code) });
      return;
    }
    // Show what the server now has (linked, waiting for review, or saved as typed) before leaving the form.
    void queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
    await queryClient.refetchQueries({ queryKey: citiesKeys.list() });
    void queryClient.invalidateQueries({ queryKey: CITIES_KEY });
    setBusy(false);
    onSaved(res.data?.arrivalPrompt ?? null);
  };

  return (
    <>
      <form className="cities__card cities__where" onSubmit={(e) => void save(e)} noValidate aria-labelledby={`${cityId}-title`}>
        <h2 id={`${cityId}-title`} className="cities__where-title">
          {correcting ? "Edit your city" : "Where do you live?"}
        </h2>
        <p className="cities__lede">We’ll show you alumni nearby, who’s new in town and who’s asking about your city.</p>
        <label htmlFor={cityId} className="cities__label">
          City
        </label>
        <input
          id={cityId}
          className="cities__input"
          value={city}
          placeholder="e.g. Bengaluru"
          autoComplete="address-level2"
          maxLength={RESIDENCE_MAX}
          aria-invalid={error?.field === "city" ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setCity(e.target.value);
            setError(null);
          }}
        />
        {askCountry ? (
          <>
            <label htmlFor={countryId} className="cities__label">
              Country
            </label>
            <input
              id={countryId}
              className="cities__input"
              value={country}
              placeholder="e.g. India"
              autoComplete="country-name"
              list={countryListId}
              maxLength={RESIDENCE_MAX}
              aria-invalid={error?.field === "country" ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onChange={(e) => {
                setCountry(e.target.value);
                setError(null);
              }}
            />
            <datalist id={countryListId}>
              {RESIDENCE_COUNTRY_NAMES.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </>
        ) : (
          <p className="cities__hint cities__where-country">
            <span>Country: {savedCountry}</span>
            <button type="button" className="cities__textbtn cities__textbtn--small" onClick={() => setAskCountry(true)}>
              Change country
            </button>
          </p>
        )}
        {error ? (
          <p id={errorId} className="cities__error" role="alert">
            {error.text}
          </p>
        ) : null}
        <div className="cities__where-actions">
          <button type="submit" className="cities__primary" disabled={busy}>
            {busy ? "Saving…" : "Save to my profile"}
          </button>
          {onCancel ? (
            <button type="button" className="cities__secondary" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <BrowseCities cities={cities} onOpenAll={onOpenAll} />
    </>
  );
}

/** "Or browse a city": the top cities with alumni, plus the full list. */
export function BrowseCities({ cities, onOpenAll }: { cities: CityListItem[]; onOpenAll: () => void }) {
  return (
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
  );
}

/**
 * Saved, but not linked to a city page (switch off, the new-city limit, a city that wasn't added, or no
 * match in that country). Says what was saved, truthfully: never "waiting for review" here, because a
 * city waiting for review is linked and opens its own page instead.
 */
export function SavedCityCard({
  saved,
  justSaved,
  cities,
  onEdit,
  onOpenAll,
}: {
  saved: SavedResidence & { city: string };
  justSaved: boolean;
  cities: CityListItem[];
  onEdit: () => void;
  onOpenAll: () => void;
}) {
  const where = saved.country ? `${saved.city}, ${saved.country}` : saved.city;
  return (
    <>
      <section className="cities__card cities__where" aria-labelledby="cities-saved-title">
        <p className="cities__eyebrow">Your city</p>
        <h2 id="cities-saved-title" className="cities__where-title cities__saved-city">
          {where}
        </h2>
        <p className="cities__lede" role="status">
          {justSaved ? "Saved to your profile." : "Saved on your profile."}
        </p>
        <p className="cities__note">
          It isn’t linked to a city page, so there are no alumni to show here. Your profile shows it as you typed it.
        </p>
        <div className="cities__where-actions">
          <button type="button" className="cities__secondary" onClick={onEdit}>
            Edit your city
          </button>
        </div>
      </section>
      <BrowseCities cities={cities} onOpenAll={onOpenAll} />
    </>
  );
}
