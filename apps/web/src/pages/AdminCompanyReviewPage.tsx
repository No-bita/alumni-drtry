import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Nav } from "../components/Nav";
import { useAuth } from "../contexts/AuthContext";
import {
  ADMIN_ORGS_KEY,
  APPROVED_LIST_MAX,
  COMPANY_NAME_MAX,
  PENDING_COMPANIES_KEY,
  PENDING_LIMIT,
  approvedCompaniesKey,
  approvedListKey,
  fetchApprovedList,
  fetchPendingCompanies,
  formatAddedDate,
  linkApprovedCompany,
  renameCompany,
  rejectCompany,
  reviewCompany,
  reviewErrorMessage,
  searchApprovedCompanies,
  takenMessage,
  type ApprovedCompanyOption,
  type ApprovedCompanyRow,
  type NameTaken,
  type PendingCompany,
} from "../lib/adminCompanies";
import "../styles/admin-analytics.css";
import "../styles/admin-companies.css";

const NO_UNDO = "This changes live data and there's no undo control yet.";

type Open =
  | { id: string; step: "approve" }
  | { id: string; step: "search" }
  | { id: string; step: "link"; target: ApprovedCompanyOption }
  | { id: string; step: "edit"; draft: string }
  | { id: string; step: "reject"; draft: string }
  | { id: string; step: "taken"; draft: string; existing: NameTaken };

/** What a card needs, for either a pending or an approved company. */
type CardCompany = {
  id: string;
  name: string;
  submittedName: string | null;
  kind: "pending" | "approved";
  meta: string;
  /** Approved only: how many other names are linked to it (they move along when it's linked). */
  linkedNames: number;
};

/** "Same company as…": search approved companies, pick one. */
function SameCompanyPicker({
  company,
  excludeId,
  onPick,
  onCancel,
}: {
  company: { name: string };
  excludeId?: string;
  onPick: (o: ApprovedCompanyOption) => void;
  onCancel: () => void;
}) {
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
  const rows = results.data?.filter((o) => o.id !== excludeId);
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
      ) : !rows || rows.length === 0 ? (
        <p className="cr-panel__note">
          {q
            ? excludeId
              ? <>No other approved company matches &lsquo;{q}&rsquo;.</>
              : <>No approved company matches &lsquo;{q}&rsquo;. Approve it as its own company instead?</>
            : excludeId
              ? "No other approved companies yet."
              : "No approved companies yet. Approve this one as its own company instead?"}
        </p>
      ) : (
        <ul className="cr-options" aria-label="Approved companies">
          {rows.map((o) => (
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

/** Edit name: a text box with the current name; saving renames it for everyone who picked it. */
function EditNamePanel({
  company,
  draft,
  busy,
  onDraft,
  onSave,
  onCancel,
}: {
  company: CardCompany;
  draft: string;
  busy: boolean;
  onDraft: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const inputId = useId();
  const tidy = draft.replace(/\s+/g, " ").trim();
  const canSave = tidy.length >= 2 && tidy !== company.name;
  return (
    <form
      className="cr-panel"
      aria-label={`Edit name of ${company.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave && !busy) onSave();
      }}
    >
      <label htmlFor={inputId} className="cr-panel__label">
        Company name
      </label>
      <input
        id={inputId}
        className="cr-search"
        type="text"
        value={draft}
        autoFocus
        autoComplete="off"
        maxLength={COMPANY_NAME_MAX}
        onChange={(e) => onDraft(e.target.value)}
      />
      <p className="cr-panel__note">
        Everyone who picked &lsquo;{company.name}&rsquo; will see the new name, and Ask will match the new name instead of the old one.
        {company.kind === "pending" ? " It stays waiting for review." : ""} {NO_UNDO}
      </p>
      <div className="cr-actions">
        <button type="submit" className="cr-btn cr-btn--primary" disabled={!canSave || busy}>
          {busy ? "Saving…" : "Save name"}
        </button>
        <button type="button" className="cr-btn" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Reject: a reason is required; the submitter sees it on their profile and can fix the company there. */
function RejectPanel({
  company,
  draft,
  busy,
  onDraft,
  onConfirmReject,
  onCancel,
}: {
  company: CardCompany;
  draft: string;
  busy: boolean;
  onDraft: (v: string) => void;
  onConfirmReject: () => void;
  onCancel: () => void;
}) {
  const inputId = useId();
  const reason = draft.trim();
  const canReject = reason.length >= 3;
  return (
    <form
      className="cr-panel"
      aria-label={`Reject ${company.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (canReject && !busy) onConfirmReject();
      }}
    >
      <p className="cr-panel__text">
        Reject <strong>&lsquo;{company.name}&rsquo;</strong>? It stays out of the directory, and the submitter is asked on their profile to
        fix it. {NO_UNDO}
      </p>
      <label htmlFor={inputId} className="cr-panel__label">
        Reason (the submitter sees this)
      </label>
      <input
        id={inputId}
        className="cr-search"
        type="text"
        value={draft}
        autoFocus
        autoComplete="off"
        maxLength={500}
        onChange={(e) => onDraft(e.target.value)}
      />
      <div className="cr-actions">
        <button type="submit" className="cr-btn cr-btn--primary" disabled={!canReject || busy}>
          {busy ? "Rejecting…" : "Yes, reject"}
        </button>
        <button type="button" className="cr-btn" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
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
  onRename,
  onReject,
}: {
  company: CardCompany;
  open: Open | null;
  busy: boolean;
  error: string | null;
  onOpen: (o: Open) => void;
  onClose: () => void;
  onConfirm: (sameAs: ApprovedCompanyOption | null) => void;
  onRename: (name: string) => void;
  onReject: (reason: string) => void;
}) {
  const mine = open && open.id === company.id ? open : null;
  const pending = company.kind === "pending";
  const Heading = pending ? "h2" : "h3";
  return (
    <li className={`cr-card${mine ? " is-open" : ""}`}>
      <Heading className="cr-card__name">{company.name}</Heading>
      <p className="cr-card__meta">{company.meta}</p>
      {company.submittedName && company.submittedName !== company.name ? (
        <p className="cr-card__meta">Submitted as: {company.submittedName}</p>
      ) : null}

      {!mine ? (
        <div className="cr-actions">
          {pending ? (
            <button type="button" className="cr-btn cr-btn--primary" onClick={() => onOpen({ id: company.id, step: "approve" })}>
              Approve company
            </button>
          ) : null}
          <button type="button" className="cr-btn" onClick={() => onOpen({ id: company.id, step: "search" })}>
            Same company as…
          </button>
          <button type="button" className="cr-btn" onClick={() => onOpen({ id: company.id, step: "edit", draft: company.name })}>
            Edit name
          </button>
          {pending ? (
            <button type="button" className="cr-btn" onClick={() => onOpen({ id: company.id, step: "reject", draft: "" })}>
              Reject
            </button>
          ) : null}
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
        <SameCompanyPicker
          company={company}
          excludeId={pending ? undefined : company.id}
          onPick={(target) => onOpen({ id: company.id, step: "link", target })}
          onCancel={onClose}
        />
      ) : mine.step === "edit" ? (
        <EditNamePanel
          company={company}
          draft={mine.draft}
          busy={busy}
          onDraft={(draft) => onOpen({ id: company.id, step: "edit", draft })}
          onSave={() => onRename(mine.draft)}
          onCancel={onClose}
        />
      ) : mine.step === "reject" ? (
        <RejectPanel
          company={company}
          draft={mine.draft}
          busy={busy}
          onDraft={(draft) => onOpen({ id: company.id, step: "reject", draft })}
          onConfirmReject={() => onReject(mine.draft.trim())}
          onCancel={onClose}
        />
      ) : mine.step === "taken" ? (
        <div className="cr-panel" role="group" aria-label={`Name already used: ${mine.existing.name}`}>
          <p className="cr-panel__text">{takenMessage(mine.existing)}</p>
          {mine.existing.linkTo ? (
            <p className="cr-panel__note">
              Nothing was renamed. You can mark &lsquo;{company.name}&rsquo; as the same company as &lsquo;{mine.existing.linkTo.name}&rsquo; instead.
            </p>
          ) : mine.existing.status === "linked" ? (
            <p className="cr-panel__note">Nothing was renamed. That name is already linked to this company.</p>
          ) : (
            <p className="cr-panel__note">Nothing was renamed.</p>
          )}
          <div className="cr-actions">
            {mine.existing.linkTo ? (
              <button
                type="button"
                className="cr-btn cr-btn--primary"
                onClick={() => onOpen({ id: company.id, step: "link", target: mine.existing.linkTo! })}
              >
                Same company as {mine.existing.linkTo.name}
              </button>
            ) : null}
            <button type="button" className="cr-btn" onClick={() => onOpen({ id: company.id, step: "edit", draft: mine.draft })}>
              Try another name
            </button>
            <button type="button" className="cr-btn" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="cr-panel" role="group" aria-label={`Confirm linking ${company.name}`}>
          <p className="cr-panel__text">
            Link <strong>&lsquo;{company.name}&rsquo;</strong> to <strong>&lsquo;{mine.target.name}&rsquo;</strong>? People listed under{" "}
            {company.name} stay as they are. Asking about {mine.target.name} will also find them; asking about {company.name} finds only them.
            {company.linkedNames > 0
              ? ` The ${company.linkedNames === 1 ? "name" : `${company.linkedNames} names`} linked to ${company.name} will be linked to ${mine.target.name} too.`
              : ""}{" "}
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

function pendingCard(c: PendingCompany): CardCompany {
  const added = formatAddedDate(c.createdAt);
  return {
    id: c.id,
    name: c.name,
    submittedName: c.submittedName ?? null,
    kind: "pending",
    meta: `${added ? `Added ${added}` : "Added"}${c.createdByEmail ? ` · by ${c.createdByEmail}` : ""}`,
    linkedNames: 0,
  };
}

function approvedCard(c: ApprovedCompanyRow): CardCompany {
  return {
    id: c.id,
    name: c.name,
    submittedName: c.submittedName,
    kind: "approved",
    meta: c.linkedTo
      ? `Linked to ${c.linkedTo.name}`
      : c.linkedNames > 0
        ? `Main company · ${c.linkedNames} ${c.linkedNames === 1 ? "name" : "names"} linked to it`
        : "Main company",
    linkedNames: c.linkedNames,
  };
}

/** "Approved companies": search every approved name to fix it or link it. */
function ApprovedSection({ cardProps }: { cardProps: (c: CardCompany) => Omit<Parameters<typeof CompanyCard>[0], "company"> }) {
  const inputId = useId();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const list = useQuery({
    queryKey: approvedListKey(q),
    queryFn: ({ signal }) => fetchApprovedList(q, signal),
    staleTime: 30_000,
  });
  return (
    <section className="cr-section" aria-labelledby="cr-approved-title">
      <h2 id="cr-approved-title" className="cr-section__title">
        Approved companies
      </h2>
      <p className="cr-head__lede">Fix a name, or mark it as the same company as another.</p>
      <label htmlFor={inputId} className="cr-panel__label">
        Search approved companies
      </label>
      <input
        id={inputId}
        className="cr-search"
        type="search"
        value={text}
        autoComplete="off"
        maxLength={100}
        placeholder="e.g. Amazon"
        onChange={(e) => setText(e.target.value)}
      />
      {list.isPending ? (
        <p className="cr-panel__note" role="status">
          Loading approved companies…
        </p>
      ) : list.isError ? (
        <p className="cr-panel__error" role="alert">
          Couldn&apos;t load approved companies.{" "}
          <button type="button" className="cr-link" onClick={() => void list.refetch()}>
            Try again
          </button>
        </p>
      ) : list.data.length === 0 ? (
        <p className="cr-panel__note">{q ? <>No approved company matches &lsquo;{q}&rsquo;.</> : "No approved companies yet."}</p>
      ) : (
        <>
          <ul className="cr-list" aria-label="Approved companies list">
            {list.data.map((c) => {
              const company = approvedCard(c);
              return <CompanyCard key={c.id} company={company} {...cardProps(company)} />;
            })}
          </ul>
          {list.data.length >= APPROVED_LIST_MAX ? (
            <p className="cr-panel__note">Showing the first {APPROVED_LIST_MAX}. Type more of the name to narrow it down.</p>
          ) : null}
        </>
      )}
    </section>
  );
}

/** /admin/companies — review company names people typed: approve, link, or fix the name; and fix approved ones. */
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
  const fail = (err: unknown) => {
    const { message, refreshList } = reviewErrorMessage(err);
    setError(message);
    if (refreshList) void queryClient.invalidateQueries({ queryKey: ADMIN_ORGS_KEY });
  };

  const confirm = async (company: CardCompany, sameAs: ApprovedCompanyOption | null) => {
    setBusy(true);
    setError(null);
    try {
      if (company.kind === "pending") {
        await reviewCompany(company.id, sameAs?.id ?? null);
        queryClient.setQueryData<PendingCompany[]>(PENDING_COMPANIES_KEY, (rows) => rows?.filter((r) => r.id !== company.id));
        setDone(sameAs ? `Linked ‘${company.name}’ to ‘${sameAs.name}’.` : `Approved ‘${company.name}’.`);
      } else if (sameAs) {
        const { movedLinkedNames } = await linkApprovedCompany(company.id, sameAs.id);
        setDone(
          `Linked ‘${company.name}’ to ‘${sameAs.name}’${
            movedLinkedNames > 0 ? `, with the ${movedLinkedNames === 1 ? "name" : `${movedLinkedNames} names`} linked to it` : ""
          }.`,
        );
      }
      // Approved names and links changed: the picker and the approved list refresh.
      void queryClient.invalidateQueries({ queryKey: ["admin", "orgs", "approved"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "orgs", "approvedList"] });
      setOpen(null);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const rename = async (company: CardCompany, draft: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await renameCompany(company.id, draft);
      if (r.result === "taken") {
        setOpen({ id: company.id, step: "taken", draft, existing: r.existing });
        return;
      }
      const { name, submittedName } = r.organization;
      if (company.kind === "pending") {
        queryClient.setQueryData<PendingCompany[]>(PENDING_COMPANIES_KEY, (rows) =>
          rows?.map((row) => (row.id === company.id ? { ...row, name, submittedName } : row)),
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["admin", "orgs", "approved"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "orgs", "approvedList"] });
      setOpen(null);
      setDone(`Renamed ‘${company.name}’ to ‘${name}’.${company.kind === "pending" ? " It's still waiting for review." : ""}`);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const reject = async (company: CardCompany, reason: string) => {
    setBusy(true);
    setError(null);
    try {
      await rejectCompany(company.id, reason);
      queryClient.setQueryData<PendingCompany[]>(PENDING_COMPANIES_KEY, (rows) => rows?.filter((r) => r.id !== company.id));
      setDone(`Rejected ‘${company.name}’. The submitter is asked on their profile to fix it.`);
      setOpen(null);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const cardProps = (company: CardCompany) => ({
    open,
    busy,
    error,
    onOpen: openCard,
    onClose: close,
    onConfirm: (sameAs: ApprovedCompanyOption | null) => void confirm(company, sameAs),
    onRename: (name: string) => void rename(company, name),
    onReject: (reason: string) => void reject(company, reason),
  });

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
                  : `${count >= PENDING_LIMIT ? `${PENDING_LIMIT}+` : count} company ${count === 1 ? "name is" : "names are"} waiting. Approving, linking or renaming changes live data, and there's no undo yet.`}
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
                {rows.map((c) => {
                  const company = pendingCard(c);
                  return <CompanyCard key={c.id} company={company} {...cardProps(company)} />;
                })}
              </ul>
            ) : null}
            {count >= PENDING_LIMIT ? (
              <p className="aa-footnote">Showing the oldest {PENDING_LIMIT}. Reload after reviewing some to see the rest.</p>
            ) : null}
            <ApprovedSection cardProps={cardProps} />
          </>
        )}
      </main>
    </div>
  );
}
