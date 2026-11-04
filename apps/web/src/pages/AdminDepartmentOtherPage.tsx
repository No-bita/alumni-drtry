import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Nav } from "../components/Nav";
import { useAuth } from "../contexts/AuthContext";
import {
  REJECT_REASON_MAX,
  approveSubmission,
  departmentsKey,
  fetchDepartments,
  fetchHistory,
  fetchReviewQueue,
  formatDate,
  historyKey,
  historySummary,
  linkSubmission,
  rejectSubmission,
  reviewErrorMessage,
  reviewKey,
  type DepartmentOtherSubmission,
  type DepartmentOption,
  type ReviewTab,
} from "../lib/adminDepartmentOther";
import "../styles/admin-analytics.css";
import "../styles/admin-companies.css";
import "../styles/admin-cities.css";

const SAVED_TOGETHER = "This changes live data. It's recorded in the review history.";

type Open =
  | { personId: string; step: "approve" }
  | { personId: string; step: "reject"; draft: string }
  | { personId: string; step: "link" }
  | { personId: string; step: "history" };

function useDebounced(text: string, ms = 250): string {
  const [value, setValue] = useState(text);
  useEffect(() => {
    const t = setTimeout(() => setValue(text.trim()), ms);
    return () => clearTimeout(t);
  }, [text, ms]);
  return value;
}

/** Link panel: pick the catalog department this member actually belongs to. */
function LinkPicker({ submission, onPick, onCancel }: { submission: DepartmentOtherSubmission; onPick: (o: DepartmentOption) => void; onCancel: () => void }) {
  const inputId = useId();
  const [text, setText] = useState("");
  const departments = useQuery({ queryKey: departmentsKey, queryFn: ({ signal }) => fetchDepartments(signal), staleTime: 60_000 });
  const options = (departments.data ?? []).filter((d) => d.name.toLowerCase().includes(text.trim().toLowerCase()));
  return (
    <div className="cr-panel" role="group" aria-label={`Link ${submission.fullName} to a department`}>
      <label htmlFor={inputId} className="cr-panel__label">
        Link to an existing department
      </label>
      <input
        id={inputId}
        className="cr-search"
        type="search"
        value={text}
        autoFocus
        autoComplete="off"
        maxLength={100}
        placeholder="Search departments"
        onChange={(e) => setText(e.target.value)}
      />
      {departments.isPending ? (
        <p className="cr-panel__note" role="status">Loading departments…</p>
      ) : departments.isError ? (
        <p className="cr-panel__error" role="alert">
          Couldn&apos;t load departments.{" "}
          <button type="button" className="cr-link" onClick={() => void departments.refetch()}>
            Try again
          </button>
        </p>
      ) : options.length === 0 ? (
        <p className="cr-panel__note">No department matches.</p>
      ) : (
        <ul className="cr-options" aria-label="Departments">
          {options.slice(0, 20).map((o) => (
            <li key={o.id}>
              <button type="button" className="cr-option" onClick={() => onPick(o)}>
                {o.name}
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

function SubmissionHistory({ personId }: { personId: string }) {
  const history = useQuery({ queryKey: historyKey(personId), queryFn: ({ signal }) => fetchHistory(personId, signal) });
  if (history.isPending) return <p className="cr-panel__note" role="status">Loading history…</p>;
  if (history.isError) return <p className="cr-panel__error" role="alert">Couldn&apos;t load the history.</p>;
  if (history.data.length === 0) return <p className="cr-panel__note">No history yet.</p>;
  return (
    <ol className="ct-history" aria-label="Review history">
      {history.data.map((h) => (
        <li key={h.id}>
          <span>{historySummary(h)}</span>
          <span className="ct-history__meta">
            {formatDate(h.at)}
            {h.actorName ? ` · ${h.actorName}` : h.action === "submitted" ? "" : " · (person removed)"}
          </span>
        </li>
      ))}
    </ol>
  );
}

function SubmissionCard({
  submission,
  open,
  busy,
  error,
  onOpen,
  onClose,
  onApprove,
  onReject,
  onLink,
}: {
  submission: DepartmentOtherSubmission;
  open: Open | null;
  busy: boolean;
  error: string | null;
  onOpen: (o: Open) => void;
  onClose: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onLink: (departmentId: string) => void;
}) {
  const mine = open && open.personId === submission.personId ? open : null;
  const reasonId = useId();
  return (
    <li className={`cr-card${mine ? " is-open" : ""}`}>
      <h2 className="cr-card__name">{submission.departmentOtherText}</h2>
      <p className="cr-card__meta">
        {submission.fullName}
        {submission.batchYear ? ` · Batch ${submission.batchYear}` : ""} · {submission.institutionalEmail} · Updated {formatDate(submission.updatedAt)}
      </p>
      {submission.status === "rejected" && submission.rejectionReason ? (
        <p className="cr-card__meta">Rejected: {submission.rejectionReason}</p>
      ) : null}

      {!mine || mine.step === "history" ? (
        <div className="cr-actions">
          <button type="button" className="cr-btn cr-btn--primary" disabled={busy} onClick={() => onOpen({ personId: submission.personId, step: "approve" })}>
            Approve
          </button>
          <button type="button" className="cr-btn" disabled={busy} onClick={() => onOpen({ personId: submission.personId, step: "reject", draft: submission.rejectionReason ?? "" })}>
            Reject
          </button>
          <button type="button" className="cr-btn" disabled={busy} onClick={() => onOpen({ personId: submission.personId, step: "link" })}>
            Link to department
          </button>
          <button type="button" className="cr-link" disabled={busy} onClick={() => onOpen({ personId: submission.personId, step: "history" })}>
            History
          </button>
        </div>
      ) : null}

      {error && mine ? <p className="cr-panel__error" role="alert">{error}</p> : null}

      {mine?.step === "approve" ? (
        <div className="cr-panel" role="group" aria-label={`Approve ${submission.departmentOtherText}`}>
          <p className="cr-panel__note">
            Approving shows &ldquo;{submission.departmentOtherText}&rdquo; on {submission.fullName}&apos;s profile. {SAVED_TOGETHER}
          </p>
          <div className="cr-actions">
            <button type="button" className="cr-btn cr-btn--primary" disabled={busy} onClick={onApprove}>
              Confirm approve
            </button>
            <button type="button" className="cr-btn" disabled={busy} onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {mine?.step === "reject" ? (
        <div className="cr-panel" role="group" aria-label={`Reject ${submission.departmentOtherText}`}>
          <label className="cr-panel__label" htmlFor={reasonId}>
            Reason (shown to the member)
          </label>
          <textarea
            id={reasonId}
            className="cr-search"
            rows={2}
            maxLength={REJECT_REASON_MAX}
            value={mine.draft}
            autoFocus
            onChange={(e) => onOpen({ personId: submission.personId, step: "reject", draft: e.target.value })}
          />
          <div className="cr-actions">
            <button type="button" className="cr-btn cr-btn--primary" disabled={busy || !mine.draft.trim()} onClick={() => onReject(mine.draft.trim())}>
              Confirm reject
            </button>
            <button type="button" className="cr-btn" disabled={busy} onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {mine?.step === "link" ? (
        <LinkPicker submission={submission} onPick={(o) => onLink(o.id)} onCancel={onClose} />
      ) : null}

      {mine?.step === "history" ? (
        <>
          <SubmissionHistory personId={submission.personId} />
          <div className="cr-actions">
            <button type="button" className="cr-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      ) : null}
    </li>
  );
}

/** /admin/department-other — review member-typed "Other" departments before they show publicly. */
export function AdminDepartmentOtherPage() {
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
  const searchId = useId();

  const list = useQuery({
    queryKey: reviewKey(tab, q),
    queryFn: ({ signal }) => fetchReviewQueue(tab, q, signal),
    enabled: isAdmin,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "department-other"] });
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setOpen(null);
      invalidate();
    } catch (err) {
      const { message, refresh } = reviewErrorMessage(err);
      setError(message);
      if (refresh) invalidate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="aa-shell">
      <Nav
        variant="home"
        avatarName={displayName}
        appToolbarLead={
          <div className="nav-app-toolbar__welcome">
            <h1 className="nav-app-toolbar__welcome-title">Department review</h1>
          </div>
        }
      />
      <main className="aa-page cr-page">
        {!isAdmin ? (
          <p className="aa-message" role="alert">
            This page is for admins.
          </p>
        ) : (
          <>
            <header className="cr-head">
              <p className="cr-head__lede">
                Departments members typed when they picked &ldquo;Other&rdquo;. They stay off profiles, the directory
                and search until approved here — or link the member to an existing department instead.
              </p>
              <Link to="/admin/analytics" className="cr-link">
                Back to analytics
              </Link>
            </header>

            <div className="ct-tabs" role="tablist" aria-label="Submissions to review">
              {(["pending", "rejected"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  className={`ct-tab${tab === t ? " is-active" : ""}`}
                  onClick={() => {
                    setTab(t);
                    setOpen(null);
                  }}
                >
                  {t === "pending" ? "Waiting" : "Rejected"}
                </button>
              ))}
            </div>

            <label htmlFor={searchId} className="cr-panel__label">
              Search
            </label>
            <input
              id={searchId}
              className="cr-search"
              type="search"
              value={text}
              placeholder="Search name or department"
              maxLength={100}
              onChange={(e) => setText(e.target.value)}
            />

            {list.isPending ? (
              <p className="cr-panel__note" role="status">Loading…</p>
            ) : list.isError ? (
              <div className="aa-message" role="alert">
                <p className="cr-panel__text">Couldn&apos;t load the queue.</p>
                <button type="button" className="cr-btn" onClick={() => void list.refetch()}>
                  Try again
                </button>
              </div>
            ) : list.data.length === 0 ? (
              <p className="cr-panel__note">
                {tab === "pending" ? "Nothing waiting for review." : "No rejected submissions."}
              </p>
            ) : (
              <ul className="cr-list" aria-label={tab === "pending" ? "Departments waiting for review" : "Rejected departments"}>
                {list.data.map((s) => (
                  <SubmissionCard
                    key={s.personId}
                    submission={s}
                    open={open}
                    busy={busy}
                    error={error}
                    onOpen={(o) => {
                      setError(null);
                      setOpen(o);
                    }}
                    onClose={() => setOpen(null)}
                    onApprove={() => void run(() => approveSubmission(s.personId))}
                    onReject={(reason) => void run(() => rejectSubmission(s.personId, reason))}
                    onLink={(departmentId) => void run(() => linkSubmission(s.personId, departmentId))}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
