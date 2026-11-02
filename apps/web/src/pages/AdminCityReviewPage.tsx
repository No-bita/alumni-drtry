import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Nav } from "../components/Nav";
import { useAuth } from "../contexts/AuthContext";
import {
  ADMIN_CITIES_KEY,
  AdminCityError,
  CITY_NAME_MAX,
  REJECT_REASON_MAX,
  REJECT_REASON_MIN,
  approveCity,
  approvedCitiesKey,
  cityHistoryKey,
  cityReviewErrorMessage,
  fetchCityHistory,
  fetchReviewCities,
  formatCityDate,
  rejectCity,
  reopenCity,
  reviewCitiesKey,
  sameCityAs,
  searchApprovedCities,
  type ApprovedCityOption,
  type ReviewCity,
  type ReviewTab,
} from "../lib/adminCities";
import "../styles/admin-analytics.css";
import "../styles/admin-companies.css";
import "../styles/admin-cities.css";

const SAVED_TOGETHER = "This changes live data. It's recorded in the city's history.";

type Open =
  | { id: string; step: "approve"; draft: string }
  | { id: string; step: "reject"; draft: string }
  | { id: string; step: "reopen" }
  | { id: string; step: "search" }
  | { id: string; step: "sameAs"; target: ApprovedCityOption }
  | { id: string; step: "history" };

function useDebounced(text: string, ms = 250): string {
  const [value, setValue] = useState(text);
  useEffect(() => {
    const t = setTimeout(() => setValue(text.trim()), ms);
    return () => clearTimeout(t);
  }, [text, ms]);
  return value;
}

/** "Same city as…": search approved cities and pick one. */
function SameCityPicker({ city, onPick, onCancel }: { city: ReviewCity; onPick: (o: ApprovedCityOption) => void; onCancel: () => void }) {
  const inputId = useId();
  const [text, setText] = useState("");
  const q = useDebounced(text);
  const results = useQuery({
    queryKey: approvedCitiesKey(q, city.id),
    queryFn: ({ signal }) => searchApprovedCities(q, city.id, signal),
    staleTime: 30_000,
  });
  return (
    <div className="cr-panel" role="group" aria-label={`Same city as… for ${city.city}`}>
      <label htmlFor={inputId} className="cr-panel__label">
        Search approved cities
      </label>
      <input
        id={inputId}
        className="cr-search"
        type="search"
        value={text}
        autoFocus
        autoComplete="off"
        maxLength={100}
        placeholder="e.g. Gurugram"
        onChange={(e) => setText(e.target.value)}
      />
      {results.isPending ? (
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
      ) : results.data.length === 0 ? (
        <p className="cr-panel__note">{q ? <>No approved city matches &lsquo;{q}&rsquo;.</> : "No approved cities yet."}</p>
      ) : (
        <ul className="cr-options" aria-label="Approved cities">
          {results.data.map((o) => (
            <li key={o.id}>
              <button type="button" className="cr-option" onClick={() => onPick(o)}>
                {o.city}, {o.country}
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

function CityHistory({ placeId }: { placeId: string }) {
  const history = useQuery({ queryKey: cityHistoryKey(placeId), queryFn: ({ signal }) => fetchCityHistory(placeId, signal) });
  if (history.isPending) return <p className="cr-panel__note" role="status">Loading history…</p>;
  if (history.isError) return <p className="cr-panel__error" role="alert">Couldn&apos;t load the history.</p>;
  if (history.data.length === 0) return <p className="cr-panel__note">No history yet.</p>;
  return (
    <ol className="ct-history" aria-label="City history">
      {history.data.map((h) => (
        <li key={h.id}>
          <span>{h.summary}</span>
          <span className="ct-history__meta">
            {formatCityDate(h.at)}
            {h.actorName ? ` · ${h.actorName}` : h.action === "submitted" ? "" : " · (person removed)"}
          </span>
        </li>
      ))}
    </ol>
  );
}

function CityCard({
  city,
  open,
  busy,
  error,
  onOpen,
  onClose,
  onApprove,
  onReject,
  onReopen,
  onSameAs,
}: {
  city: ReviewCity;
  open: Open | null;
  busy: boolean;
  error: string | null;
  onOpen: (o: Open) => void;
  onClose: () => void;
  onApprove: (rename: string | null) => void;
  onReject: (reason: string) => void;
  onReopen: () => void;
  onSameAs: (target: ApprovedCityOption) => void;
}) {
  const mine = open && open.id === city.id ? open : null;
  const added = formatCityDate(city.submittedAt);
  const reasonId = useId();
  const nameId = useId();
  return (
    <li className={`cr-card${mine ? " is-open" : ""}`}>
      <h2 className="cr-card__name">
        {city.city}, {city.country}
      </h2>
      <p className="cr-card__meta">
        {city.linkedMembers} {city.linkedMembers === 1 ? "member" : "members"} linked
        {added ? ` · Added ${added}` : ""}
        {city.submittedByEmailMasked ? ` · by ${city.submittedByEmailMasked}` : ""}
      </p>
      {city.aliases.length > 0 ? <p className="cr-card__meta">Other spellings: {city.aliases.join(", ")}</p> : null}
      {city.status === "rejected" && city.rejectionReason ? (
        <p className="cr-card__meta">
          Rejected{city.reviewedAt ? ` ${formatCityDate(city.reviewedAt)}` : ""}: {city.rejectionReason}
        </p>
      ) : null}

      {!mine || mine.step === "history" ? (
        <div className="cr-actions">
          {city.status === "pending" ? (
            <>
              <button type="button" className="cr-btn cr-btn--primary" onClick={() => onOpen({ id: city.id, step: "approve", draft: city.city })}>
                Approve
              </button>
              <button type="button" className="cr-btn" onClick={() => onOpen({ id: city.id, step: "search" })}>
                Same city as…
              </button>
              <button type="button" className="cr-btn" onClick={() => onOpen({ id: city.id, step: "reject", draft: "" })}>
                Reject
              </button>
            </>
          ) : (
            <>
              <button type="button" className="cr-btn cr-btn--primary" onClick={() => onOpen({ id: city.id, step: "reopen" })}>
                Reopen
              </button>
              <button type="button" className="cr-btn" onClick={() => onOpen({ id: city.id, step: "search" })}>
                Same city as…
              </button>
            </>
          )}
          <button
            type="button"
            className="cr-link"
            aria-expanded={mine?.step === "history"}
            onClick={() => (mine?.step === "history" ? onClose() : onOpen({ id: city.id, step: "history" }))}
          >
            {mine?.step === "history" ? "Hide history" : "History"}
          </button>
        </div>
      ) : mine.step === "approve" ? (
        <form
          className="cr-panel"
          aria-label={`Approve ${city.city}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) onApprove(mine.draft.trim() && mine.draft.trim() !== city.city ? mine.draft.trim() : null);
          }}
        >
          <label htmlFor={nameId} className="cr-panel__label">
            City name
          </label>
          <input
            id={nameId}
            className="cr-search"
            type="text"
            value={mine.draft}
            autoFocus
            maxLength={CITY_NAME_MAX}
            onChange={(e) => onOpen({ id: city.id, step: "approve", draft: e.target.value })}
          />
          <p className="cr-panel__note">
            Fix the spelling first if you need to; what they typed keeps working as another spelling. Once approved, the city shows in
            Cities, search and Ask. {SAVED_TOGETHER}
          </p>
          <div className="cr-actions">
            <button type="submit" className="cr-btn cr-btn--primary" disabled={busy || mine.draft.trim().length < 2}>
              {busy ? "Approving…" : "Yes, approve"}
            </button>
            <button type="button" className="cr-btn" disabled={busy} onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      ) : mine.step === "reject" ? (
        <form
          className="cr-panel"
          aria-label={`Reject ${city.city}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && mine.draft.trim().length >= REJECT_REASON_MIN) onReject(mine.draft.trim());
          }}
        >
          <label htmlFor={reasonId} className="cr-panel__label">
            Reason (required)
          </label>
          <textarea
            id={reasonId}
            className="cr-search ct-reason"
            rows={3}
            value={mine.draft}
            autoFocus
            maxLength={REJECT_REASON_MAX}
            onChange={(e) => onOpen({ id: city.id, step: "reject", draft: e.target.value })}
          />
          <p className="cr-panel__note">
            Only the member who typed it, and admins, see the reason. Linked members stay linked, so reopening restores them. {SAVED_TOGETHER}
          </p>
          <div className="cr-actions">
            <button type="submit" className="cr-btn cr-btn--primary" disabled={busy || mine.draft.trim().length < REJECT_REASON_MIN}>
              {busy ? "Rejecting…" : "Reject city"}
            </button>
            <button type="button" className="cr-btn" disabled={busy} onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      ) : mine.step === "reopen" ? (
        <div className="cr-panel" role="group" aria-label={`Reopen ${city.city}`}>
          <p className="cr-panel__text">
            Put <strong>&lsquo;{city.city}&rsquo;</strong> back in the queue? It goes back to waiting for review. {SAVED_TOGETHER}
          </p>
          <div className="cr-actions">
            <button type="button" className="cr-btn cr-btn--primary" disabled={busy} onClick={onReopen}>
              {busy ? "Reopening…" : "Yes, reopen"}
            </button>
            <button type="button" className="cr-btn" disabled={busy} onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      ) : mine.step === "search" ? (
        <SameCityPicker city={city} onPick={(target) => onOpen({ id: city.id, step: "sameAs", target })} onCancel={onClose} />
      ) : (
        <div className="cr-panel" role="group" aria-label={`Confirm same city as ${mine.target.city}`}>
          <p className="cr-panel__text">
            Treat <strong>&lsquo;{city.city}&rsquo;</strong> as <strong>&lsquo;{mine.target.city}, {mine.target.country}&rsquo;</strong>? Its{" "}
            {city.linkedMembers} linked {city.linkedMembers === 1 ? "member moves" : "members move"} there and &lsquo;{city.city}&rsquo; becomes
            another spelling of it. Nothing is deleted; what members typed stays as they wrote it. {SAVED_TOGETHER}
          </p>
          <div className="cr-actions">
            <button type="button" className="cr-btn cr-btn--primary" disabled={busy} onClick={() => onSameAs(mine.target)}>
              {busy ? "Combining…" : "Yes, same city"}
            </button>
            <button type="button" className="cr-btn" disabled={busy} onClick={() => onOpen({ id: city.id, step: "search" })}>
              Back
            </button>
          </div>
        </div>
      )}
      {mine?.step === "history" ? <CityHistory placeId={city.id} /> : null}
      {mine && error ? (
        <p className="cr-panel__error" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function RecentHistory() {
  const history = useQuery({ queryKey: cityHistoryKey(null), queryFn: ({ signal }) => fetchCityHistory(null, signal) });
  return (
    <section className="cr-section" aria-labelledby="ct-history-title">
      <h2 id="ct-history-title" className="cr-section__title">
        Recent history
      </h2>
      <p className="cr-head__lede">Every submission, approval, rejection, reopening and combine, newest first. Only admins see this.</p>
      {history.isPending ? (
        <p className="cr-panel__note" role="status">
          Loading history…
        </p>
      ) : history.isError ? (
        <p className="cr-panel__error" role="alert">
          Couldn&apos;t load the history.
        </p>
      ) : history.data.length === 0 ? (
        <p className="cr-panel__note">Nothing yet. History starts when city review is switched on.</p>
      ) : (
        <ol className="ct-history" aria-label="Recent city history">
          {history.data.map((h) => (
            <li key={h.id}>
              <span>{h.summary}</span>
              <span className="ct-history__meta">
                {h.country} · {formatCityDate(h.at)}
                {h.actorName ? ` · ${h.actorName}` : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** /admin/cities — cities members typed that aren't on the list yet: approve, combine, reject, reopen. */
export function AdminCityReviewPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = auth.status === "authenticated" && auth.person.role !== "alumni";
  const displayName = auth.status === "authenticated" ? auth.myProfile?.fullName?.trim() || undefined : undefined;
  const [tab, setTab] = useState<ReviewTab>("pending");
  const [text, setText] = useState("");
  const q = useDebounced(text);
  const [open, setOpen] = useState<Open | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const searchId = useId();

  const list = useQuery({
    queryKey: reviewCitiesKey(tab, q),
    queryFn: ({ signal }) => fetchReviewCities(tab, q, signal),
    enabled: isAdmin,
    retry: (count, err) => !(err instanceof AdminCityError && err.code === "NOT_FOUND") && count < 1,
  });
  const switchedOff = list.error instanceof AdminCityError && list.error.code === "NOT_FOUND";

  const openCard = (o: Open) => {
    setOpen(o);
    setError(null);
  };
  const close = () => {
    setOpen(null);
    setError(null);
  };

  const act = async (work: () => Promise<void>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      setOpen(null);
      setDone(message);
      void queryClient.invalidateQueries({ queryKey: ADMIN_CITIES_KEY });
    } catch (err) {
      const { message: msg, refresh } = cityReviewErrorMessage(err);
      setError(msg);
      if (refresh) void queryClient.invalidateQueries({ queryKey: ADMIN_CITIES_KEY });
    } finally {
      setBusy(false);
    }
  };

  const rows = list.data ?? [];

  return (
    <div className="aa-shell">
      <Nav
        variant="home"
        avatarName={displayName}
        appToolbarLead={
          <div className="nav-app-toolbar__welcome">
            <h1 className="nav-app-toolbar__welcome-title">City review</h1>
          </div>
        }
      />
      <main className="aa-page cr-page">
        {!isAdmin ? (
          <p className="aa-message" role="alert">
            This page is for admins.
          </p>
        ) : switchedOff ? (
          <div className="aa-message" role="status">
            <p className="cr-panel__text">City review is switched off. New cities members type stay as typed text until it&apos;s on.</p>
            <Link to="/admin/analytics" className="cr-link">
              Back to analytics
            </Link>
          </div>
        ) : (
          <>
            <header className="cr-head">
              <p className="cr-head__lede">Cities members typed that aren&apos;t on the list yet. Pending and rejected cities stay out of Cities, search and Ask.</p>
              <Link to="/admin/analytics" className="cr-link">
                Back to analytics
              </Link>
            </header>
            <div className="ct-tabs" role="tablist" aria-label="Cities to review">
              {(["pending", "rejected"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  className={`ct-tab${tab === t ? " is-active" : ""}`}
                  onClick={() => {
                    setTab(t);
                    close();
                  }}
                >
                  {t === "pending" ? "Waiting" : "Rejected"}
                </button>
              ))}
            </div>
            <label htmlFor={searchId} className="cr-panel__label">
              Search cities
            </label>
            <input
              id={searchId}
              className="cr-search"
              type="search"
              value={text}
              autoComplete="off"
              maxLength={100}
              placeholder="City or country"
              onChange={(e) => setText(e.target.value)}
            />
            {done ? (
              <p className="cr-done" role="status">
                {done}
              </p>
            ) : null}
            {list.isPending ? (
              <p className="aa-message" role="status">
                Loading cities…
              </p>
            ) : list.isError ? (
              <div className="aa-message" role="alert">
                <p className="cr-panel__text">Couldn&apos;t load the cities.</p>
                <button type="button" className="cr-btn" onClick={() => void list.refetch()}>
                  Try again
                </button>
              </div>
            ) : rows.length === 0 ? (
              <p className="cr-panel__note">
                {tab === "pending" ? "Nothing waiting. New cities members type will appear here." : "No rejected cities."}
              </p>
            ) : (
              <ul className="cr-list" aria-label={tab === "pending" ? "Cities waiting for review" : "Rejected cities"}>
                {rows.map((c) => (
                  <CityCard
                    key={c.id}
                    city={c}
                    open={open}
                    busy={busy}
                    error={error}
                    onOpen={openCard}
                    onClose={close}
                    onApprove={(rename) => void act(() => approveCity(c.id, rename), `Approved ‘${rename ?? c.city}’.`)}
                    onReject={(reason) => void act(() => rejectCity(c.id, reason), `Rejected ‘${c.city}’.`)}
                    onReopen={() => void act(() => reopenCity(c.id), `Reopened ‘${c.city}’. It's back under Waiting.`)}
                    onSameAs={(target) =>
                      void act(() => sameCityAs(c.id, target.id), `Combined ‘${c.city}’ into ‘${target.city}’. Its members moved there.`)
                    }
                  />
                ))}
              </ul>
            )}
            <RecentHistory />
          </>
        )}
      </main>
    </div>
  );
}
