import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Nav } from "../components/Nav";
import { useAuth } from "../contexts/AuthContext";
import {
  VIEW_AS_SEARCH_MIN,
  ViewAsError,
  reloadAppAt,
  searchViewAsPeople,
  startViewAs,
  viewAsName,
  viewAsPeopleKey,
  type ViewAsPerson,
} from "../lib/viewAs";
import "../styles/admin-analytics.css";
import "../styles/admin-companies.css";

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function personLine(p: ViewAsPerson): string {
  return [
    p.institutionalEmail,
    p.batchYear ? `’${String(p.batchYear).slice(2)}` : null,
    p.departmentCode ? p.departmentCode.toUpperCase() : null,
    p.role !== "alumni" ? (p.role === "super_admin" ? "Super admin" : "Admin") : null,
    p.suspended ? "Suspended" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * /admin/view-as — open a member's account read-only, for testing. Only for admins the API allowlists
 * (VIEW_AS_ADMIN_EMAILS); everyone else sees nothing here, and the API refuses them regardless.
 */
export function AdminViewAsPage() {
  const auth = useAuth();
  const [params] = useSearchParams();
  const inputId = useId();
  const [text, setText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = useDebounced(text.trim());

  const authed = auth.status === "authenticated";
  const viewAs = authed ? (auth.viewAs ?? null) : null;
  const allowed = authed && Boolean(auth.canViewAs) && !viewAs;
  const displayName = authed && !viewAs ? auth.myProfile?.fullName?.trim() || undefined : undefined;
  const ended = params.get("ended");

  const results = useQuery({
    queryKey: viewAsPeopleKey(q),
    queryFn: ({ signal }) => searchViewAsPeople(q, signal),
    enabled: allowed && q.length >= VIEW_AS_SEARCH_MIN,
    staleTime: 30_000,
  });

  const begin = async (p: ViewAsPerson) => {
    setBusyId(p.personId);
    setError(null);
    try {
      await startViewAs(p.personId);
      reloadAppAt("/home");
    } catch (err) {
      setError(err instanceof ViewAsError ? err.message : "Couldn't start viewing as this member.");
      setBusyId(null);
    }
  };

  return (
    <div className="aa-shell">
      <Nav
        variant="home"
        avatarName={displayName}
        appToolbarLead={
          <div className="nav-app-toolbar__welcome">
            <h1 className="nav-app-toolbar__welcome-title">View as member</h1>
          </div>
        }
      />
      <main className="aa-page cr-page">
        {viewAs ? (
          <p className="aa-message" role="status">
            You&apos;re viewing as {viewAsName(viewAs)}. Use Exit in the red bar to go back to your own account.
          </p>
        ) : !allowed ? (
          <p className="aa-message" role="alert">
            This page is for admins.
          </p>
        ) : (
          <>
            {ended === "expired" ? (
              <p className="cr-done" role="status">
                View-as ended after its time limit. You&apos;re back on your own account.
              </p>
            ) : ended ? (
              <p className="cr-done" role="status">
                You&apos;re back on your own account.
              </p>
            ) : null}
            <section className="cr-section" aria-labelledby="va-title">
              <h2 id="va-title" className="cr-section__title">
                Open a member&apos;s account
              </h2>
              <p className="cr-panel__note">
                For testing only. You see what they see, read-only: nothing can be sent, answered, posted or changed as them,
                and nothing is marked as seen. It ends by itself after a short time. Every start and exit is logged.
              </p>
              <label htmlFor={inputId} className="cr-panel__label">
                Name or email
              </label>
              <input
                id={inputId}
                className="cr-search"
                type="search"
                value={text}
                maxLength={120}
                autoComplete="off"
                placeholder="Search members"
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
                  {results.data.map((p) => (
                    <li key={p.personId} className="cr-panel va-result">
                      <span className="va-result__who">
                        <span className="va-result__name">{p.fullName?.trim() || "No name yet"}</span>
                        <span className="cr-panel__note">{personLine(p)}</span>
                      </span>
                      <button
                        type="button"
                        className="cr-btn cr-btn--primary"
                        disabled={busyId !== null}
                        aria-label={`View as ${p.fullName?.trim() || p.institutionalEmail}`}
                        onClick={() => void begin(p)}
                      >
                        {busyId === p.personId ? "Opening…" : "View as"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
