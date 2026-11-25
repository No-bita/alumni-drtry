import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import {
  VIEW_AS_SEARCH_MIN,
  ViewAsError,
  endViewAs,
  reloadAppAt,
  searchViewAsPeople,
  switchViewAs,
  viewAsName,
  viewAsPeopleKey,
  viewAsPersonLine,
  type ViewAsPerson,
} from "../lib/viewAs";
import "../styles/admin-companies.css";
import "../styles/view-as.css";

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function endsAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Admin "view as member" control: who you're viewing now, a member search, and View as / Switch to.
 * Shown only to admins the API allowlists (`canViewAs`, which stays true while viewing), so it also
 * works mid view-as to change member without exiting first. Switching reloads into the member's Home.
 */
export function ViewAsCard({ id }: { id?: string }) {
  const auth = useAuth();
  const inputId = useId();
  const titleId = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = useDebounced(text.trim());

  const authed = auth.status === "authenticated";
  const allowed = authed && Boolean(auth.canViewAs);
  const viewAs = authed ? (auth.viewAs ?? null) : null;

  const results = useQuery({
    queryKey: viewAsPeopleKey(q),
    queryFn: ({ signal }) => searchViewAsPeople(q, signal),
    enabled: allowed && q.length >= VIEW_AS_SEARCH_MIN,
    staleTime: 30_000,
  });

  if (!allowed) return null;

  const open = async (p: ViewAsPerson) => {
    setBusy(p.personId);
    setError(null);
    try {
      await switchViewAs(p.personId);
      reloadAppAt("/home");
    } catch (err) {
      setError(err instanceof ViewAsError ? err.message : "Couldn't open this member's account.");
      setBusy(null);
    }
  };

  const exit = async () => {
    setBusy("exit");
    setError(null);
    try {
      await endViewAs();
      reloadAppAt("/admin/analytics");
    } catch (err) {
      setError(err instanceof ViewAsError ? err.message : "Couldn't exit view-as. Try again.");
      setBusy(null);
    }
  };

  const verb = viewAs ? "Switch to" : "View as";

  return (
    <section id={id} className="cr-section va-card" aria-labelledby={titleId}>
      <h2 id={titleId} className="cr-section__title">
        View as member
      </h2>
      {viewAs ? (
        <div className="va-card__now" role="status">
          <p>
            Viewing as <strong>{viewAsName(viewAs)}</strong>, read-only
            {endsAt(viewAs.expiresAt) ? <> until {endsAt(viewAs.expiresAt)}</> : null}.
          </p>
          <button type="button" className="cr-btn" disabled={busy !== null} onClick={() => void exit()}>
            {busy === "exit" ? "Exiting…" : "Back to my account"}
          </button>
        </div>
      ) : (
        <p className="va-card__now" role="status">
          You&apos;re on your own account.
        </p>
      )}
      <p className="cr-panel__note">
        For testing only. You see what they see, read-only: nothing can be sent, answered, posted or changed as them, and
        nothing is marked as seen. It ends by itself after a short time. Every start, switch and exit is logged.
      </p>
      <label htmlFor={inputId} className="cr-panel__label">
        {viewAs ? "Switch to another member" : "Name or email"}
      </label>
      <input
        id={inputId}
        className="cr-search"
        type="search"
        value={text}
        maxLength={120}
        autoComplete="off"
        placeholder="Search members by name or email"
        onChange={(e) => setText(e.target.value)}
      />
      {error ? (
        <p className="cr-panel__error" role="alert">
          {error}
        </p>
      ) : null}
      {q.length < VIEW_AS_SEARCH_MIN ? null : results.isPending ? (
        <p className="cr-panel__note" role="status">
          Searching…
        </p>
      ) : results.isError ? (
        <p className="cr-panel__error">
          {results.error instanceof ViewAsError ? results.error.message : "Couldn't search members."}
        </p>
      ) : results.data.length === 0 ? (
        <p className="cr-panel__note">No member matches.</p>
      ) : (
        <ul className="va-results" aria-label="Matching members">
          {results.data.map((p) => {
            const name = p.fullName?.trim() || "No name yet";
            const current = viewAs?.targetPersonId === p.personId;
            return (
              <li key={p.personId} className="cr-panel va-result">
                <span className="va-result__who">
                  <span className="va-result__name">{name}</span>
                  <span className="cr-panel__note">{viewAsPersonLine(p)}</span>
                </span>
                {current ? (
                  <span className="va-result__current">Viewing now</span>
                ) : (
                  <button
                    type="button"
                    className="cr-btn cr-btn--primary"
                    disabled={busy !== null}
                    aria-label={`${verb} ${p.fullName?.trim() || p.institutionalEmail}`}
                    onClick={() => void open(p)}
                  >
                    {busy === p.personId ? "Opening…" : verb}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
