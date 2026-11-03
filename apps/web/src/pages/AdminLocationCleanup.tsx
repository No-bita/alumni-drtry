import { useEffect, useId, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Nav } from "../components/Nav";
import { useAuth } from "../contexts/AuthContext";
import {
  CITY_NAME_MAX,
  LOCATIONS_KEY,
  citySearchKey,
  combineCities,
  createCity,
  createCityFromTyped,
  fetchInbox,
  formatWhen,
  ignoreMerge,
  ignoreTyped,
  inboxKey,
  linkedText,
  locationErrorMessage,
  parseSpellings,
  searchCities,
  suggestCityName,
  treatAsCity,
  type CitySearchHit,
  type MergeSuggestion,
  type UnlinkedTypedCity,
} from "../lib/adminLocations";
import "../styles/admin-analytics.css";
import "../styles/admin-companies.css";
import "../styles/admin-cities.css";
import "../styles/admin-locations.css";

const RECORDED = "This changes live data. It's recorded in the city's history; nothing is deleted.";

function useDebounced(text: string, ms = 250): string {
  const [value, setValue] = useState(text.trim());
  useEffect(() => {
    const t = setTimeout(() => setValue(text.trim()), ms);
    return () => clearTimeout(t);
  }, [text, ms]);
  return value;
}

/** Search approved cities by name or spelling and pick one. */
export function CityPicker({
  label,
  excludeId,
  onPick,
  onCancel,
}: {
  label: string;
  excludeId?: string;
  onPick: (hit: CitySearchHit) => void;
  onCancel: () => void;
}) {
  const inputId = useId();
  const [text, setText] = useState("");
  const q = useDebounced(text);
  const results = useQuery({
    queryKey: citySearchKey(q),
    queryFn: ({ signal }) => searchCities(q, signal),
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
  const hits = (results.data ?? []).filter((h) => h.id !== excludeId);
  return (
    <div className="cr-panel" role="group" aria-label={label}>
      <label htmlFor={inputId} className="cr-panel__label">
        Search cities
      </label>
      <input
        id={inputId}
        className="cr-search"
        type="search"
        value={text}
        autoFocus
        autoComplete="off"
        maxLength={100}
        placeholder="e.g. Bengaluru"
        onChange={(e) => setText(e.target.value)}
      />
      {q.length < 2 ? (
        <p className="cr-panel__note">Type at least two letters.</p>
      ) : results.isPending ? (
        <p className="cr-panel__note" role="status">
          Searching…
        </p>
      ) : results.isError ? (
        <p className="cr-panel__error" role="alert">
          Couldn&apos;t search cities.{" "}
          <button type="button" className="cr-link" onClick={() => void results.refetch()}>
            Try again
          </button>
        </p>
      ) : hits.length === 0 ? (
        <p className="cr-panel__note">No city matches &lsquo;{q}&rsquo;. Add it as a new city instead.</p>
      ) : (
        <ul className="cr-options" aria-label="Cities">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" className="cr-option" onClick={() => onPick(h)}>
                {h.city_label} <span className="lc-muted">· {h.country}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="cr-actions">
        <button type="button" className="cr-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

type Open =
  | { key: string; step: "create"; name: string; spellings: string }
  | { key: string; step: "search" }
  | { key: string; step: "treat"; target: { id: string; city: string; country: string } };

function typedKey(r: UnlinkedTypedCity): string {
  return `${r.normCountry}|${r.normCity}`;
}

function TypedCityCard({
  row,
  open,
  busy,
  error,
  onOpen,
  onClose,
  onCreate,
  onTreat,
  onIgnore,
}: {
  row: UnlinkedTypedCity;
  open: Open | null;
  busy: boolean;
  error: string | null;
  onOpen: (o: Open) => void;
  onClose: () => void;
  onCreate: (name: string, spellings: string[]) => void;
  onTreat: (target: { id: string; city: string }) => void;
  onIgnore: () => void;
}) {
  const key = typedKey(row);
  const mine = open && open.key === key ? open : null;
  const nameId = useId();
  const spellId = useId();
  const typed = `${row.displayCity}`;
  const people = `${row.profiles} ${row.profiles === 1 ? "member" : "members"}`;
  // Only a real suggestion (the server always picks a nearest city, even a poor one: no confidence = no suggestion).
  const suggestion =
    row.suggestedTreatAsCityId && row.suggestedCityLabel && row.suggestionConfidence
      ? { id: row.suggestedTreatAsCityId, city: row.suggestedCityLabel, country: row.suggestedCountryLabel ?? row.displayCountry }
      : null;

  return (
    <li className={`cr-card${mine ? " is-open" : ""}`}>
      <h3 className="cr-card__name">
        {typed}, {row.displayCountry}
      </h3>
      <p className="cr-card__meta">
        {people} typed this{row.lastSeenAt ? ` · last saved ${formatWhen(row.lastSeenAt)}` : ""}
      </p>
      {suggestion && !mine ? (
        <p className="cr-panel__note">
          {row.suggestionConfidence === "high" ? "Looks like" : "Might be"} {suggestion.city}.
        </p>
      ) : null}

      {!mine ? (
        <div className="cr-actions">
          <button
            type="button"
            className="cr-btn cr-btn--primary"
            onClick={() => onOpen({ key, step: "create", name: suggestCityName(row.displayCity), spellings: "" })}
          >
            Create city
          </button>
          {suggestion ? (
            <button type="button" className="cr-btn" onClick={() => onOpen({ key, step: "treat", target: suggestion })}>
              Same as {suggestion.city}
            </button>
          ) : null}
          <button type="button" className="cr-btn" onClick={() => onOpen({ key, step: "search" })}>
            Same city as…
          </button>
          <button type="button" className="cr-btn" disabled={busy} onClick={onIgnore}>
            Ignore for now
          </button>
        </div>
      ) : mine.step === "create" ? (
        <form
          className="cr-panel"
          aria-label={`Create a city from ${typed}`}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (mine.name.trim().length >= 2 && !busy) onCreate(mine.name.trim(), parseSpellings(mine.spellings));
          }}
        >
          <label htmlFor={nameId} className="cr-panel__label">
            City name
          </label>
          <input
            id={nameId}
            className="cr-search"
            value={mine.name}
            maxLength={CITY_NAME_MAX}
            autoFocus
            autoComplete="off"
            onChange={(e) => onOpen({ ...mine, name: e.target.value })}
          />
          <label htmlFor={spellId} className="cr-panel__label">
            Other spellings <span className="lc-muted">(optional, separated by commas)</span>
          </label>
          <input
            id={spellId}
            className="cr-search"
            value={mine.spellings}
            autoComplete="off"
            placeholder="e.g. Bangalore, Banglore, BLR"
            onChange={(e) => onOpen({ ...mine, spellings: e.target.value })}
          />
          <p className="cr-panel__note">
            &lsquo;{typed}&rsquo; is kept as a spelling. Members who typed the name or any spelling in {row.displayCountry} are linked now; anyone already linked to another city stays where they are. {RECORDED}
          </p>
          <div className="cr-actions">
            <button type="submit" className="cr-btn cr-btn--primary" disabled={busy || mine.name.trim().length < 2}>
              {busy ? "Creating…" : "Create and link"}
            </button>
            <button type="button" className="cr-btn" disabled={busy} onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      ) : mine.step === "search" ? (
        <CityPicker
          label={`Same city as… for ${typed}`}
          onPick={(hit) => onOpen({ key, step: "treat", target: { id: hit.id, city: hit.city_label, country: hit.country } })}
          onCancel={onClose}
        />
      ) : (
        <div className="cr-panel" role="group" aria-label={`Confirm ${typed} is ${mine.target.city}`}>
          <p className="cr-panel__text">
            Link the {people} who typed <strong>&lsquo;{typed}&rsquo;</strong> to <strong>{mine.target.city}, {mine.target.country}</strong>? &lsquo;{typed}&rsquo; is saved as a spelling, so it matches from now on. {RECORDED}
          </p>
          <div className="cr-actions">
            <button type="button" className="cr-btn cr-btn--primary" disabled={busy} onClick={() => onTreat(mine.target)}>
              {busy ? "Linking…" : "Yes, link"}
            </button>
            <button type="button" className="cr-btn" disabled={busy} onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {mine && error ? (
        <p className="cr-panel__error" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function AddCityForm({ busy, onAdd }: { busy: boolean; onAdd: (country: string, name: string, spellings: string[]) => Promise<boolean> }) {
  const countryId = useId();
  const nameId = useId();
  const spellId = useId();
  const [country, setCountry] = useState("India");
  const [name, setName] = useState("");
  const [spellings, setSpellings] = useState("");
  const ok = name.trim().length >= 2 && country.trim().length >= 2;
  return (
    <form
      className="cr-panel"
      aria-label="Add a city"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ok || busy) return;
        if (await onAdd(country.trim(), name.trim(), parseSpellings(spellings))) {
          setName("");
          setSpellings("");
        }
      }}
    >
      <div className="lc-grid">
        <div className="lc-field">
          <label htmlFor={nameId} className="cr-panel__label">
            City name
          </label>
          <input id={nameId} className="cr-search" value={name} maxLength={CITY_NAME_MAX} autoComplete="off" placeholder="e.g. Bengaluru" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="lc-field">
          <label htmlFor={countryId} className="cr-panel__label">
            Country
          </label>
          <input id={countryId} className="cr-search" value={country} maxLength={CITY_NAME_MAX} autoComplete="off" onChange={(e) => setCountry(e.target.value)} />
        </div>
      </div>
      <label htmlFor={spellId} className="cr-panel__label">
        Other spellings <span className="lc-muted">(optional, separated by commas)</span>
      </label>
      <input id={spellId} className="cr-search" value={spellings} autoComplete="off" placeholder="e.g. Bangalore, BLR" onChange={(e) => setSpellings(e.target.value)} />
      <p className="cr-panel__note">Members who already typed the name or a spelling in that country are linked straight away.</p>
      <div className="cr-actions">
        <button type="submit" className="cr-btn cr-btn--primary" disabled={!ok || busy}>
          {busy ? "Adding…" : "Add city"}
        </button>
      </div>
    </form>
  );
}

function MergeCard({ row, busy, onCombine, onIgnore }: { row: MergeSuggestion; busy: boolean; onCombine: () => void; onIgnore: () => void }) {
  const other = row.recommendedKeepCityId === row.cityOneId ? row.cityTwoLabel : row.cityOneLabel;
  return (
    <li className="cr-card">
      <h3 className="cr-card__name">
        {row.cityOneLabel} ↔ {row.cityTwoLabel}
      </h3>
      <p className="cr-card__meta">
        {row.country} · {row.usersAffected} {row.usersAffected === 1 ? "member" : "members"} · keeps {row.resultingCityLabel}
      </p>
      <p className="cr-panel__note">
        Combining moves everyone and everything from {other} to {row.resultingCityLabel}; {other} stays as a redirect. {RECORDED}
      </p>
      <div className="cr-actions">
        <button type="button" className="cr-btn cr-btn--primary" disabled={busy} onClick={onCombine}>
          Combine into {row.resultingCityLabel}
        </button>
        <button type="button" className="cr-btn" disabled={busy} onClick={onIgnore}>
          Not the same city
        </button>
      </div>
    </li>
  );
}

/** /admin/locations — Location cleanup: turn what members typed into cities, add cities, spot duplicates. */
export function AdminLocationCleanup() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = auth.status === "authenticated" && auth.person.role !== "alumni";
  const displayName = auth.status === "authenticated" ? auth.myProfile?.fullName?.trim() || undefined : undefined;
  const [open, setOpen] = useState<Open | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const inbox = useQuery({ queryKey: inboxKey(), queryFn: ({ signal }) => fetchInbox(signal), enabled: isAdmin });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: LOCATIONS_KEY });
  const act = async (work: () => Promise<string>, where: "card" | "page") => {
    setBusy(true);
    setError(null);
    setPageError(null);
    try {
      const message = await work();
      setOpen(null);
      setDone(message);
      refresh();
      return true;
    } catch (err) {
      const msg = locationErrorMessage(err);
      if (where === "card") setError(msg);
      else setPageError(msg);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const data = inbox.data;
  const typed = data?.unmappedClusters ?? [];
  const cities = data?.approvedCities ?? [];
  const merges = data?.suggestedMerges ?? [];
  const activity = data?.recentActivity ?? [];
  const waiting = typed.reduce((n, r) => n + r.profiles, 0);

  return (
    <div className="aa-shell">
      <Nav
        variant="home"
        avatarName={displayName}
        appToolbarLead={
          <div className="nav-app-toolbar__welcome">
            <h1 className="nav-app-toolbar__welcome-title">Location cleanup</h1>
          </div>
        }
      />
      <main className="aa-page cr-page">
        {!isAdmin ? (
          <p className="aa-message" role="alert">
            This page is for admins.
          </p>
        ) : inbox.isPending ? (
          <p className="aa-message" role="status">
            Loading cities…
          </p>
        ) : inbox.isError ? (
          <div className="aa-message" role="alert">
            <p className="cr-panel__text">Couldn&apos;t load Location cleanup.</p>
            <button type="button" className="cr-btn" onClick={() => void inbox.refetch()}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <header className="cr-head">
              <p className="cr-head__lede">
                Members only show up on a city page once their typed city is linked to a city here. {waiting > 0 ? `${waiting} ${waiting === 1 ? "member is" : "members are"} waiting.` : "Everyone's typed city is linked."}
              </p>
              <div className="lc-head-links">
                <Link to="/admin/analytics" className="cr-link">
                  Back to analytics
                </Link>
                <Link to="/admin/cities" className="cr-link">
                  City review
                </Link>
              </div>
            </header>
            {done ? (
              <p className="cr-done" role="status">
                {done}
              </p>
            ) : null}

            <section className="cr-section" aria-labelledby="lc-typed-title">
              <h2 id="lc-typed-title" className="cr-section__title">
                Typed cities with no city page
              </h2>
              {typed.length === 0 ? (
                <p className="cr-panel__note">Nothing waiting. New typed cities show up here.</p>
              ) : (
                <ul className="cr-list" aria-label="Typed cities with no city page">
                  {typed.map((row) => (
                    <TypedCityCard
                      key={typedKey(row)}
                      row={row}
                      open={open}
                      busy={busy}
                      error={error}
                      onOpen={(o) => {
                        setOpen(o);
                        setError(null);
                      }}
                      onClose={() => {
                        setOpen(null);
                        setError(null);
                      }}
                      onCreate={(name, spellings) =>
                        void act(async () => {
                          const r = await createCityFromTyped({ displayCountry: row.displayCountry, displayCity: row.displayCity, cityLabel: name, extraSpellings: spellings });
                          return `Created ${r.cityLabel}, ${r.country}. ${linkedText(r.profilesUpdated)}`;
                        }, "card")
                      }
                      onTreat={(target) =>
                        void act(async () => {
                          const r = await treatAsCity({ displayCountry: row.displayCountry, displayCity: row.displayCity, treatAsCityId: target.id });
                          return `Saved ‘${row.displayCity}’ as a spelling of ${target.city}. ${linkedText(r.profilesUpdated)}`;
                        }, "card")
                      }
                      onIgnore={() =>
                        void act(async () => {
                          await ignoreTyped({ displayCountry: row.displayCountry, displayCity: row.displayCity });
                          return `Hid ‘${row.displayCity}’ for now. Those members stay as they are.`;
                        }, "page")
                      }
                    />
                  ))}
                </ul>
              )}
            </section>

            <section className="cr-section" aria-labelledby="lc-add-title">
              <h2 id="lc-add-title" className="cr-section__title">
                Add a city
              </h2>
              <AddCityForm
                busy={busy}
                onAdd={(country, name, spellings) =>
                  act(async () => {
                    const r = await createCity({ country, cityLabel: name, spellings });
                    return `Added ${r.cityLabel}, ${r.country}. ${linkedText(r.linkedMembers)}`;
                  }, "page")
                }
              />
            </section>
            {pageError ? (
              <p className="cr-panel__error" role="alert">
                {pageError}
              </p>
            ) : null}

            <section className="cr-section" aria-labelledby="lc-cities-title">
              <h2 id="lc-cities-title" className="cr-section__title">
                Cities
              </h2>
              {cities.length === 0 ? (
                <p className="cr-panel__note">No cities yet. Create one from a typed city above, or add one.</p>
              ) : (
                <ul className="lc-rows" aria-label="Cities">
                  {cities.map((c) => (
                    <li key={c.id}>
                      <Link to={`/admin/locations/places/${c.id}`} className="lc-row">
                        <span className="lc-row__title">
                          {c.city}, {c.country}
                        </span>
                        <span className="lc-row__meta">
                          {c.linkedMembers} {c.linkedMembers === 1 ? "member" : "members"} →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {merges.length > 0 ? (
              <section className="cr-section" aria-labelledby="lc-merge-title">
                <h2 id="lc-merge-title" className="cr-section__title">
                  Possible duplicates
                </h2>
                <ul className="cr-list" aria-label="Possible duplicates">
                  {merges.map((m) => (
                    <MergeCard
                      key={`${m.cityOneId}:${m.cityTwoId}`}
                      row={m}
                      busy={busy}
                      onCombine={() =>
                        void act(async () => {
                          const r = await combineCities(m.recommendedKeepCityId, m.recommendedCombineCityId);
                          return `Combined into ${m.resultingCityLabel}. ${linkedText(r.linkedMembers)}`;
                        }, "page")
                      }
                      onIgnore={() =>
                        void act(async () => {
                          await ignoreMerge(m.cityOneId, m.cityTwoId);
                          return "Marked as different cities.";
                        }, "page")
                      }
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="cr-section" aria-labelledby="lc-activity-title">
              <h2 id="lc-activity-title" className="cr-section__title">
                Recent changes
              </h2>
              {activity.length === 0 ? (
                <p className="cr-panel__note">No changes recorded yet.</p>
              ) : (
                <ol className="ct-history">
                  {activity.map((a, i) => (
                    <li key={`${a.at}-${i}`}>
                      <span>{a.summary}</span>
                      <span className="ct-history__meta">{formatWhen(a.at)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
