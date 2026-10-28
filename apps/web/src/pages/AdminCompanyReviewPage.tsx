import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Nav } from "../components/Nav";
import { useAuth } from "../contexts/AuthContext";
import {
  PENDING_COMPANIES_KEY,
  PENDING_LIMIT,
  approvedCompaniesKey,
  fetchPendingCompanies,
  formatAddedDate,
  reviewCompany,
  reviewErrorMessage,
  searchApprovedCompanies,
  type ApprovedCompanyOption,
  type PendingCompany,
} from "../lib/adminCompanies";
import "../styles/admin-analytics.css";
import "../styles/admin-companies.css";

const NO_UNDO = "This changes live data and there's no undo control yet.";

type Open =
  | { id: string; step: "approve" }
  | { id: string; step: "search" }
  | { id: string; step: "link"; target: ApprovedCompanyOption };

/** "Same company as…": search approved companies, pick one. */
function SameCompanyPicker({ company, onPick, onCancel }: { company: PendingCompany; onPick: (o: ApprovedCompanyOption) => void; onCancel: () => void }) {
  const inputId = useId();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  // Search a moment after typing stops, not on every key.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const results = useQuery({
    queryKey: approvedCompaniesKey(q),
    queryFn: ({ signal }) => searchApprovedCompanies(q, signal),
    staleTime: 30_000,
  });
  return (
    <div className="cr-panel" role="group" aria-label={`Same company as… for ${company.name}`}>
      <label htmlFor={inputId} className="cr-panel__label">
        Search approved companies
      </label>
      <input
        id={inputId}
        className="cr-search"
        type="search"
        value={text}
        autoFocus
        autoComplete="off"
        maxLength={100}
        placeholder="e.g. Goldman Sachs"
        onChange={(e) => setText(e.target.value)}
      />
      {results.isPending ? (
        <p className="cr-panel__note" role="status">
          Searching…
        </p>
      ) : results.isError ? (
        <p className="cr-panel__error" role="alert">
          Couldn&apos;t search companies.{" "}
          <button type="button" className="cr-link" onClick={() => void results.refetch()}>
            Try again
          </button>
        </p>
      ) : results.data.length === 0 ? (
        <p className="cr-panel__note">
          {q ? <>No approved company matches &lsquo;{q}&rsquo;. Approve it as its own company instead?</> : "No approved companies yet. Approve this one as its own company instead?"}
        </p>
      ) : (
        <ul className="cr-options" aria-label="Approved companies">
          {results.data.map((o) => (
            <li key={o.id}>
              <button type="button" className="cr-option" onClick={() => onPick(o)}>
                {o.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {results.data && results.data.length === 20 ? <p className="cr-panel__note">Showing the first 20. Type more of the name to narrow it down.</p> : null}
      <div className="cr-actions">
        <button type="button" className="cr-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function CompanyCard({
  company,
  open,
  busy,
  error,
  onOpen,
  onClose,
  onConfirm,
}: {
  company: PendingCompany;
  open: Open | null;
  busy: boolean;
  error: string | null;
  onOpen: (o: Open) => void;
  onClose: () => void;
  onConfirm: (sameAs: ApprovedCompanyOption | null) => void;
}) {
  const added = formatAddedDate(company.createdAt);
  const mine = open && open.id === company.id ? open : null;
  return (
    <li className={`cr-card${mine ? " is-open" : ""}`}>
      <h2 className="cr-card__name">{company.name}</h2>
      <p className="cr-card__meta">
        {added ? `Added ${added}` : "Added"}
        {company.createdByEmailMasked ? ` · by ${company.createdByEmailMasked}` : ""}
      </p>

      {!mine ? (
        <div className="cr-actions">
          <button type="button" className="cr-btn cr-btn--primary" onClick={() => onOpen({ id: company.id, step: "approve" })}>
            Approve company
          </button>
          <button type="button" className="cr-btn" onClick={() => onOpen({ id: company.id, step: "search" })}>
            Same company as…
          </button>
        </div>
      ) : mine.step === "approve" ? (
        <div className="cr-panel" role="group" aria-label={`Confirm approving ${company.name}`}>
          <p className="cr-panel__text">
            Approve <strong>&lsquo;{company.name}&rsquo;</strong> as its own company? It becomes recognisable in Ask questions. {NO_UNDO}
          </p>
          <div className="cr-actions">
            <button type="button" className="cr-btn cr-btn--primary" disabled={busy} onClick={() => onConfirm(null)}>
              {busy ? "Approving…" : "Yes, approve"}
            </button>
            <button type="button" className="cr-btn" disabled={busy} onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      ) : mine.step === "search" ? (
        <SameCompanyPicker company={company} onPick={(target) => onOpen({ id: company.id, step: "link", target })} onCancel={onClose} />
      ) : (
        <div className="cr-panel" role="group" aria-label={`Confirm linking ${company.name}`}>
          <p className="cr-panel__text">
            Link <strong>&lsquo;{company.name}&rsquo;</strong> to <strong>&lsquo;{mine.target.name}&rsquo;</strong>? People listed under{" "}
            {company.name} stay as they are. Asking about {mine.target.name} will also find them; asking about {company.name} finds only them.
            Profiles and the directory don&apos;t change. {NO_UNDO}
          </p>
          <div className="cr-actions">
            <button type="button" className="cr-btn cr-btn--primary" disabled={busy} onClick={() => onConfirm(mine.target)}>
              {busy ? "Linking…" : "Yes, link"}
            </button>
            <button type="button" className="cr-btn" disabled={busy} onClick={() => onOpen({ id: company.id, step: "search" })}>
              Back
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

/** /admin/companies — review company names people typed: approve, or mark as the same company as an approved one. */
export function AdminCompanyReviewPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = auth.status === "authenticated" && auth.person.role !== "alumni";
  const displayName = auth.status === "authenticated" ? auth.myProfile?.fullName?.trim() || undefined : undefined;
  const [open, setOpen] = useState<Open | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const pending = useQuery({
    queryKey: PENDING_COMPANIES_KEY,
    queryFn: ({ signal }) => fetchPendingCompanies(signal),
    enabled: isAdmin,
  });

  const openCard = (o: Open) => {
    setOpen(o);
    setError(null);
  };
  const close = () => {
    setOpen(null);
    setError(null);
  };

  const confirm = async (company: PendingCompany, sameAs: ApprovedCompanyOption | null) => {
    setBusy(true);
    setError(null);
    try {
      await reviewCompany(company.id, sameAs?.id ?? null);
      queryClient.setQueryData<PendingCompany[]>(PENDING_COMPANIES_KEY, (rows) => rows?.filter((r) => r.id !== company.id));
      // An approved name is now a choice in the picker.
      void queryClient.invalidateQueries({ queryKey: ["admin", "orgs", "approved"] });
      setOpen(null);
      setDone(sameAs ? `Linked ‘${company.name}’ to ‘${sameAs.name}’.` : `Approved ‘${company.name}’.`);
    } catch (err) {
      const { message, refreshList } = reviewErrorMessage(err);
      setError(message);
      if (refreshList) {
        void queryClient.invalidateQueries({ queryKey: PENDING_COMPANIES_KEY });
        void queryClient.invalidateQueries({ queryKey: ["admin", "orgs", "approved"] });
      }
    } finally {
      setBusy(false);
    }
  };

  const rows = pending.data ?? [];
  const count = rows.length;

  return (
    <div className="aa-shell">
      <Nav
        variant="home"
        avatarName={displayName}
        appToolbarLead={
          <div className="nav-app-toolbar__welcome">
            <h1 className="nav-app-toolbar__welcome-title">Company review</h1>
          </div>
        }
      />
      <main className="aa-page cr-page">
        {!isAdmin ? (
          <p className="aa-message" role="alert">
            This page is for admins.
          </p>
        ) : pending.isPending ? (
          <p className="aa-message" role="status">
            Loading companies…
          </p>
        ) : pending.isError ? (
          <div className="aa-message" role="alert">
            <p className="cr-panel__text">Couldn&apos;t load the companies waiting for review.</p>
            <button type="button" className="cr-btn" onClick={() => void pending.refetch()}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <header className="cr-head">
              <p className="cr-head__lede">
                {count === 0
                  ? "Nothing to review. New company names people type will appear here."
                  : `${count >= PENDING_LIMIT ? `${PENDING_LIMIT}+` : count} company ${count === 1 ? "name is" : "names are"} waiting. Approving or linking changes live data, and there's no undo yet.`}
              </p>
              <Link to="/admin/analytics" className="cr-link">
                Back to analytics
              </Link>
            </header>
            {done ? (
              <p className="cr-done" role="status">
                {done}
              </p>
            ) : null}
            {count > 0 ? (
              <ul className="cr-list" aria-label="Companies waiting for review">
                {rows.map((c) => (
                  <CompanyCard
                    key={c.id}
                    company={c}
                    open={open}
                    busy={busy}
                    error={error}
                    onOpen={openCard}
                    onClose={close}
                    onConfirm={(sameAs) => void confirm(c, sameAs)}
                  />
                ))}
              </ul>
            ) : null}
            {count >= PENDING_LIMIT ? (
              <p className="aa-footnote">Showing the oldest {PENDING_LIMIT}. Reload after reviewing some to see the rest.</p>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
