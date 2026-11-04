import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Nav } from "../components/Nav";
import { useAuth } from "../contexts/AuthContext";
import {
  CITY_NAME_MAX,
  LOCATIONS_KEY,
  addSpelling,
  combineInto,
  fetchPlace,
  formatWhen,
  linkedText,
  locationErrorMessage,
  placeKey,
  renameCity,
  type CitySearchHit,
} from "../lib/adminLocations";
import { rejectCity } from "../lib/adminCities";
import { CityPicker } from "./AdminLocationCleanup";
import "../styles/admin-analytics.css";
import "../styles/admin-companies.css";
import "../styles/admin-cities.css";
import "../styles/admin-locations.css";

const STATUS_LABEL: Record<string, string> = {
  approved: "Approved",
  pending: "Waiting for review",
  rejected: "Rejected",
  combined: "Combined into another city",
};

/** /admin/locations/places/:placeId — one city: spellings, name, combine a duplicate into it, history. */
export function AdminPlaceDetail() {
  const { placeId = "" } = useParams<{ placeId: string }>();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = auth.status === "authenticated" && auth.person.role !== "alumni";
  const displayName = auth.status === "authenticated" ? auth.myProfile?.fullName?.trim() || undefined : undefined;
  const spellingId = useId();
  const renameId = useId();
  const hideReasonId = useId();
  const [spelling, setSpelling] = useState("");
  const [rename, setRename] = useState<string | null>(null);
  const [hiding, setHiding] = useState(false);
  const [hideReason, setHideReason] = useState("");
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState<CitySearchHit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const detail = useQuery({ queryKey: placeKey(placeId), queryFn: ({ signal }) => fetchPlace(placeId, signal), enabled: isAdmin && Boolean(placeId) });

  const act = async (work: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    try {
      setDone(await work());
      void queryClient.invalidateQueries({ queryKey: LOCATIONS_KEY });
      return true;
    } catch (err) {
      setError(locationErrorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const d = detail.data;
  const approved = d?.place.status === "approved";
  const name = d ? `${d.place.displayCity}, ${d.place.displayCountry}` : "";
  const renameValue = rename ?? d?.place.displayCity ?? "";

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
        <Link to="/admin/locations" className="cr-link">
          ← All cities
        </Link>
        {!isAdmin ? (
          <p className="aa-message" role="alert">
            This page is for admins.
          </p>
        ) : detail.isPending ? (
          <p className="aa-message" role="status">
            Loading city…
          </p>
        ) : detail.isError || !d ? (
          <div className="aa-message" role="alert">
            <p className="cr-panel__text">Couldn&apos;t load this city.</p>
            <button type="button" className="cr-btn" onClick={() => void detail.refetch()}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <header className="cr-head">
              <h2 className="lc-title">{name}</h2>
              <p className="cr-head__lede">
                {STATUS_LABEL[d.place.status] ?? d.place.status} · {d.linkedProfiles} {d.linkedProfiles === 1 ? "member" : "members"} on the directory list this city
              </p>
              {d.place.status === "combined" && d.place.combinedIntoPlaceId ? (
                <Link to={`/admin/locations/places/${d.place.combinedIntoPlaceId}`} className="cr-link">
                  Open the city it was combined into
                </Link>
              ) : null}
            </header>
            {done ? (
              <p className="cr-done" role="status">
                {done}
              </p>
            ) : null}
            {error ? (
              <p className="cr-panel__error" role="alert">
                {error}
              </p>
            ) : null}

            <section className="cr-section" aria-labelledby="lc-spellings-title">
              <h2 id="lc-spellings-title" className="cr-section__title">
                Spellings
              </h2>
              {d.aliases.length === 0 ? (
                <p className="cr-panel__note">No spellings saved yet.</p>
              ) : (
                <ul className="lc-chips" aria-label="Saved spellings">
                  {d.aliases.map((a) => (
                    <li key={a} className="lc-chip">
                      {a}
                    </li>
                  ))}
                </ul>
              )}
              {approved ? (
                <form
                  className="cr-panel"
                  aria-label="Add a spelling"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const s = spelling.trim();
                    if (!s || busy) return;
                    if (await act(async () => `Saved ‘${s}’. ${linkedText((await addSpelling(placeId, s)).linkedMembers)}`)) setSpelling("");
                  }}
                >
                  <label htmlFor={spellingId} className="cr-panel__label">
                    Add a spelling people type
                  </label>
                  <input id={spellingId} className="cr-search" value={spelling} maxLength={CITY_NAME_MAX} autoComplete="off" placeholder="e.g. BLR" onChange={(e) => setSpelling(e.target.value)} />
                  <p className="cr-panel__note">Members who typed it in {d.place.displayCountry} and aren&apos;t linked to a city yet are linked now.</p>
                  <div className="cr-actions">
                    <button type="submit" className="cr-btn" disabled={busy || !spelling.trim()}>
                      Add spelling
                    </button>
                  </div>
                </form>
              ) : (
                <p className="cr-panel__note">Only approved cities take new spellings here.</p>
              )}
            </section>

            {d.place.status !== "combined" ? (
              <section className="cr-section" aria-labelledby="lc-rename-title">
                <h2 id="lc-rename-title" className="cr-section__title">
                  Name
                </h2>
                <form
                  className="cr-panel"
                  aria-label="Rename the city"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const next = renameValue.trim();
                    if (next.length < 2 || next === d.place.displayCity || busy) return;
                    if (await act(async () => `Renamed to ${next}. The old name is kept as a spelling. ${linkedText((await renameCity(placeId, next)).linkedMembers)}`)) setRename(null);
                  }}
                >
                  <label htmlFor={renameId} className="cr-panel__label">
                    City name
                  </label>
                  <input id={renameId} className="cr-search" value={renameValue} maxLength={CITY_NAME_MAX} autoComplete="off" onChange={(e) => setRename(e.target.value)} />
                  <p className="cr-panel__note">Profiles show this name. Members&apos; typed text isn&apos;t changed.</p>
                  <div className="cr-actions">
                    <button type="submit" className="cr-btn" disabled={busy || renameValue.trim().length < 2 || renameValue.trim() === d.place.displayCity}>
                      Save name
                    </button>
                  </div>
                </form>
              </section>
            ) : null}

            {approved ? (
              <section className="cr-section" aria-labelledby="lc-combine-title">
                <h2 id="lc-combine-title" className="cr-section__title">
                  Combine a duplicate into {d.place.displayCity}
                </h2>
                {target ? (
                  <div className="cr-panel" role="group" aria-label={`Confirm combining ${target.city_label}`}>
                    <p className="cr-panel__text">
                      Combine <strong>{target.city_label}, {target.country}</strong> into <strong>{name}</strong>? Its members, newcomers and Wall posts move here, its spellings are copied, and it stays as a redirect. Nothing is deleted; it&apos;s recorded in both cities&apos; history.
                    </p>
                    <div className="cr-actions">
                      <button
                        type="button"
                        className="cr-btn cr-btn--primary"
                        disabled={busy}
                        onClick={async () => {
                          if (await act(async () => `Combined ${target.city_label} into ${d.place.displayCity}. ${linkedText((await combineInto(placeId, target.id)).linkedMembers)}`)) {
                            setTarget(null);
                            setPicking(false);
                          }
                        }}
                      >
                        {busy ? "Combining…" : "Yes, combine"}
                      </button>
                      <button type="button" className="cr-btn" disabled={busy} onClick={() => setTarget(null)}>
                        Back
                      </button>
                    </div>
                  </div>
                ) : picking ? (
                  <CityPicker label="Pick the duplicate city" excludeId={placeId} onPick={setTarget} onCancel={() => setPicking(false)} />
                ) : (
                  <div className="cr-actions">
                    <button type="button" className="cr-btn" onClick={() => setPicking(true)}>
                      Find the duplicate…
                    </button>
                  </div>
                )}
              </section>
            ) : null}

            {approved ? (
              <section className="cr-section" aria-labelledby="lc-hide-title">
                <h2 id="lc-hide-title" className="cr-section__title">
                  Hide city
                </h2>
                {hiding ? (
                  <form
                    className="cr-panel"
                    aria-label={`Hide ${d.place.displayCity}`}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const reason = hideReason.trim();
                      if (reason.length < 3 || busy) return;
                      if (
                        await act(async () => {
                          await rejectCity(placeId, reason);
                          return `Hidden. ${d.linkedProfiles === 1 ? "The linked member stays" : `${d.linkedProfiles} linked members stay`} linked until they change city or the city is restored from the review queue.`;
                        })
                      ) {
                        setHiding(false);
                        setHideReason("");
                      }
                    }}
                  >
                    <label htmlFor={hideReasonId} className="cr-panel__label">
                      Reason
                    </label>
                    <input id={hideReasonId} className="cr-search" value={hideReason} minLength={3} maxLength={500} autoComplete="off" onChange={(e) => setHideReason(e.target.value)} />
                    <p className="cr-panel__note">
                      Hidden from browse, search and the directory right away. Linked members stay linked and see this reason on their city page. Nothing is deleted; it&apos;s recorded in history and can be restored from the review queue.
                    </p>
                    <div className="cr-actions">
                      <button type="submit" className="cr-btn cr-btn--primary" disabled={busy || hideReason.trim().length < 3}>
                        {busy ? "Hiding…" : "Hide city"}
                      </button>
                      <button type="button" className="cr-btn" disabled={busy} onClick={() => setHiding(false)}>
                        Back
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="cr-panel__note">For a city that should not be on the platform at all. A duplicate belongs in Combine instead.</p>
                    <div className="cr-actions">
                      <button type="button" className="cr-btn" onClick={() => setHiding(true)}>
                        Hide city…
                      </button>
                    </div>
                  </>
                )}
              </section>
            ) : null}

            <section className="cr-section" aria-labelledby="lc-history-title">
              <h2 id="lc-history-title" className="cr-section__title">
                History
              </h2>
              {d.recentNotes.length === 0 ? (
                <p className="cr-panel__note">Nothing recorded yet.</p>
              ) : (
                <ol className="ct-history">
                  {d.recentNotes.map((a, i) => (
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
