import { useEffect, useId, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Nav } from "../components/Nav";
import { DEPARTMENTS } from "../constants/departments";
import { useAuth } from "../contexts/AuthContext";
import {
  BATCH_MIN,
  BODY_MAX,
  CHANNEL_LABELS,
  CITY_NOTE,
  TITLE_MAX,
  AnnouncementError,
  announcementsKey,
  batchRange,
  cleanFilters,
  confirmQuestion,
  detailKey,
  fetchDetail,
  fetchHistory,
  filtersSummary,
  formatDateTime,
  historyKey,
  previewAudience,
  previewKey,
  searchCityOptions,
  sendAnnouncement,
  sendTestAnnouncement,
  statusLabel,
  type AnnouncementChannels,
  type AnnouncementContent,
  type AnnouncementFilters,
  type AnnouncementSummary,
  type CityOption,
} from "../lib/adminAnnouncements";
import "../styles/admin-analytics.css";
import "../styles/admin-companies.css";
import "../styles/admin-announcements.css";

const DEPARTMENT_LABEL = new Map<string, string>(DEPARTMENTS.map((d) => [d.code, d.label]));
const departmentLabel = (code: string) => DEPARTMENT_LABEL.get(code) ?? code;
const MAX_BATCH_YEAR = new Date().getFullYear() + 5;

function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** City multi-select: search approved city records, pick several. */
function CityPicker({ selected, onChange }: { selected: CityOption[]; onChange: (next: CityOption[]) => void }) {
  const inputId = useId();
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 250);
  const results = useQuery({
    queryKey: [...announcementsKey, "cities", q],
    queryFn: ({ signal }) => searchCityOptions(q, signal),
    enabled: q.length >= 2,
    staleTime: 60_000,
  });
  const chosen = new Set(selected.map((c) => c.id));
  const options = (results.data ?? []).filter((c) => !chosen.has(c.id));
  return (
    <div className="an-field">
      <label htmlFor={inputId} className="cr-panel__label">
        City
      </label>
      {selected.length > 0 ? (
        <ul className="an-chips" aria-label="Chosen cities">
          {selected.map((c) => (
            <li key={c.id} className="an-chip is-on">
              {c.label}
              <button
                type="button"
                className="an-chip__remove"
                aria-label={`Remove ${c.label}`}
                onClick={() => onChange(selected.filter((x) => x.id !== c.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input
        id={inputId}
        className="cr-search"
        type="search"
        value={text}
        placeholder="Search approved cities"
        maxLength={120}
        onChange={(e) => setText(e.target.value)}
      />
      {q.length >= 2 ? (
        results.isPending ? (
          <p className="cr-panel__note" role="status">Searching…</p>
        ) : results.isError ? (
          <p className="cr-panel__error">Couldn&apos;t search cities.</p>
        ) : options.length === 0 ? (
          <p className="cr-panel__note">No approved city matches.</p>
        ) : (
          <ul className="an-options" aria-label="Matching cities">
            {options.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="an-option"
                  onClick={() => {
                    onChange([...selected, c]);
                    setText("");
                  }}
                >
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
      <p className="cr-panel__note">{CITY_NOTE}</p>
    </div>
  );
}

function HistoryDetail({ id }: { id: string }) {
  const detail = useQuery({ queryKey: detailKey(id), queryFn: ({ signal }) => fetchDetail(id, signal) });
  if (detail.isPending) return <p className="cr-panel__note" role="status">Loading…</p>;
  if (detail.isError) return <p className="cr-panel__error">Couldn&apos;t load the details.</p>;
  const a = detail.data;
  const hasEmail = a.channels !== "in_app";
  const hasInApp = a.channels !== "email";
  return (
    <div className="cr-panel an-detail">
      <p className="an-detail__body">{a.body}</p>
      {a.linkPath ? (
        <p className="cr-panel__text">
          Link: <Link to={a.linkPath}>{a.linkPath}</Link>
        </p>
      ) : null}
      <dl className="an-stats">
        <div>
          <dt>Members</dt>
          <dd>{a.recipientCount.toLocaleString("en-IN")}</dd>
        </div>
        {hasInApp ? (
          <div>
            <dt>In-app seen</dt>
            <dd>
              {a.inApp.seen.toLocaleString("en-IN")} of {a.inApp.delivered.toLocaleString("en-IN")}
            </dd>
          </div>
        ) : null}
        {hasEmail ? (
          <>
            <div>
              <dt>Emails sent</dt>
              <dd>{a.email.sent.toLocaleString("en-IN")}</dd>
            </div>
            {a.email.queued > 0 ? (
              <div>
                <dt>Waiting</dt>
                <dd>{a.email.queued.toLocaleString("en-IN")}</dd>
              </div>
            ) : null}
            <div>
              <dt>Failed</dt>
              <dd>{a.email.failed.toLocaleString("en-IN")}</dd>
            </div>
            <div>
              <dt>Unsubscribed</dt>
              <dd>{a.email.skippedOptedOut.toLocaleString("en-IN")}</dd>
            </div>
          </>
        ) : null}
      </dl>
      <p className="cr-panel__note">
        Sent by {a.sender.name ?? "an admin"} · {formatDateTime(a.createdAt)}
        {a.completedAt && hasEmail ? ` · finished ${formatDateTime(a.completedAt)}` : ""}
      </p>
    </div>
  );
}

function HistoryCard({ a, open, onToggle }: { a: AnnouncementSummary; open: boolean; onToggle: () => void }) {
  return (
    <li className={`cr-card${open ? " is-open" : ""}`}>
      <p className="cr-card__name">
        {a.isTest ? <span className="an-tag">Test</span> : null}
        {a.title}
      </p>
      <p className="cr-card__meta">
        {formatDateTime(a.createdAt)} · {CHANNEL_LABELS[a.channels]} ·{" "}
        {a.isTest ? "To you" : filtersSummary(a.filters, departmentLabel)} · {a.recipientCount.toLocaleString("en-IN")}{" "}
        {a.recipientCount === 1 ? "member" : "members"}
      </p>
      <p className={`an-status an-status--${a.status}`}>{statusLabel(a)}</p>
      <div className="cr-actions">
        <button type="button" className="cr-btn" aria-expanded={open} onClick={onToggle}>
          {open ? "Hide details" : "Details"}
        </button>
      </div>
      {open ? <HistoryDetail id={a.id} /> : null}
    </li>
  );
}

type Step = { kind: "compose" } | { kind: "confirm"; count: number; changed?: boolean } | { kind: "sent"; count: number; channels: AnnouncementChannels };

/** /admin/announcements — send an announcement to members (in-app, email or both), with a full history. */
export function AdminAnnouncementsPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = auth.status === "authenticated" && auth.person.role !== "alumni";
  const displayName = auth.status === "authenticated" ? auth.myProfile?.fullName?.trim() || undefined : undefined;
  const ids = { title: useId(), body: useId(), link: useId(), from: useId(), to: useId() };

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [channels, setChannels] = useState<AnnouncementChannels>("in_app");
  const [batchFrom, setBatchFrom] = useState("");
  const [batchTo, setBatchTo] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [step, setStep] = useState<Step>({ kind: "compose" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const years = batchRange(batchFrom, batchTo, MAX_BATCH_YEAR);
  const filters: AnnouncementFilters = useMemo(
    () => cleanFilters({ batchYears: years ?? [], departmentCodes: departments, placeIds: cities.map((c) => c.id) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(years), departments, cities]
  );
  const debouncedFilters = useDebounced(filters);
  const preview = useQuery({
    queryKey: previewKey(debouncedFilters),
    queryFn: ({ signal }) => previewAudience(debouncedFilters, signal),
    enabled: isAdmin && years !== null,
  });
  const previewFresh = JSON.stringify(debouncedFilters) === JSON.stringify(filters) && !preview.isFetching;
  const history = useQuery({
    queryKey: historyKey,
    queryFn: ({ signal }) => fetchHistory(signal),
    enabled: isAdmin,
    // Emails go out in the background: keep progress current while any announcement is still sending.
    refetchInterval: (q) => (q.state.data?.some((a) => a.status === "sending") ? 10_000 : false),
  });

  const content: AnnouncementContent = {
    title: title.trim(),
    body: body.trim(),
    linkPath: link.trim() || null,
    channels,
  };
  const contentReady = content.title.length > 0 && content.body.length > 0 && title.length <= TITLE_MAX && body.length <= BODY_MAX;
  const count = preview.data?.count ?? 0;
  const canSend = contentReady && years !== null && previewFresh && preview.isSuccess && count > 0;

  const resetToCompose = () => {
    setStep({ kind: "compose" });
    setError(null);
  };
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setNotice(null);
    if (step.kind !== "compose") resetToCompose();
  };

  const refreshHistory = () => void queryClient.invalidateQueries({ queryKey: historyKey });

  const sendTest = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await sendTestAnnouncement(content);
      const where = channels === "in_app" ? "your Notifications" : channels === "email" ? "your email" : "your Notifications and email";
      setNotice(`Test sent to ${where}. It's in the history, marked Test.`);
      refreshHistory();
    } catch (err) {
      setError(err instanceof AnnouncementError ? err.message : "Couldn't send the test.");
    } finally {
      setBusy(false);
    }
  };

  const send = async (confirmCount: number) => {
    setBusy(true);
    setError(null);
    try {
      const a = await sendAnnouncement(content, filters, confirmCount);
      setStep({ kind: "sent", count: a.recipientCount, channels: a.channels });
      setTitle("");
      setBody("");
      setLink("");
      refreshHistory();
      setOpenId(a.id);
    } catch (err) {
      if (err instanceof AnnouncementError && err.code === "ANNOUNCEMENT_COUNT_CHANGED") {
        // Re-count and ask again with the new number.
        const fresh = await queryClient.fetchQuery({
          queryKey: previewKey(filters),
          queryFn: ({ signal }) => previewAudience(filters, signal),
          staleTime: 0,
        });
        setStep(fresh.count > 0 ? { kind: "confirm", count: fresh.count, changed: true } : { kind: "compose" });
        if (fresh.count === 0) setError("No members match these filters any more.");
      } else {
        setError(err instanceof AnnouncementError ? err.message : "Couldn't send the announcement.");
      }
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
            <h1 className="nav-app-toolbar__welcome-title">Announcements</h1>
          </div>
        }
      />
      <main className="aa-page cr-page an-page">
        {!isAdmin ? (
          <p className="aa-message" role="alert">
            This page is for admins.
          </p>
        ) : (
          <>
            <header className="cr-head">
              <p className="cr-head__lede">
                Send a message to members in their Notifications, by email, or both. Emails go to each member&apos;s
                institutional and personal address, with an unsubscribe link.
              </p>
              <Link to="/admin/analytics" className="cr-link">
                Back to analytics
              </Link>
            </header>

            <section className="cr-section an-section" aria-labelledby="an-compose">
              <h2 id="an-compose" className="cr-section__title">
                Compose
              </h2>
              <div className="an-field">
                <label htmlFor={ids.title} className="cr-panel__label">
                  Title
                </label>
                <input
                  id={ids.title}
                  className="cr-search"
                  value={title}
                  maxLength={TITLE_MAX}
                  onChange={(e) => edit(setTitle)(e.target.value)}
                />
                <p className="an-counter" aria-live="polite">
                  {title.length}/{TITLE_MAX}
                </p>
              </div>
              <div className="an-field">
                <label htmlFor={ids.body} className="cr-panel__label">
                  Message
                </label>
                <textarea
                  id={ids.body}
                  className="cr-search an-textarea"
                  value={body}
                  rows={6}
                  maxLength={BODY_MAX}
                  onChange={(e) => edit(setBody)(e.target.value)}
                />
                <p className="an-counter" aria-live="polite">
                  {body.length}/{BODY_MAX}
                </p>
              </div>
              <div className="an-field">
                <label htmlFor={ids.link} className="cr-panel__label">
                  Link (optional)
                </label>
                <input
                  id={ids.link}
                  className="cr-search"
                  value={link}
                  maxLength={300}
                  placeholder="/intent/career"
                  onChange={(e) => edit(setLink)(e.target.value)}
                />
                <p className="cr-panel__note">A page inside the app, e.g. /intent/career. Shown as an &ldquo;Open&rdquo; link.</p>
              </div>
              <fieldset className="an-field an-fieldset">
                <legend className="cr-panel__label">Send by</legend>
                <div className="an-radios">
                  {(["both", "in_app", "email"] as const).map((c) => (
                    <label key={c} className={`an-radio${channels === c ? " is-on" : ""}`}>
                      <input
                        type="radio"
                        name="an-channels"
                        value={c}
                        checked={channels === c}
                        onChange={() => edit(setChannels)(c)}
                      />
                      {CHANNEL_LABELS[c]}
                    </label>
                  ))}
                </div>
              </fieldset>
            </section>

            <section className="cr-section an-section" aria-labelledby="an-audience">
              <h2 id="an-audience" className="cr-section__title">
                Who gets it
              </h2>
              <p className="cr-panel__note">Leave everything empty to send to every member. Filters combine: batch and department and city.</p>
              <div className="an-field">
                <span className="cr-panel__label">Batch</span>
                <div className="an-range">
                  <label htmlFor={ids.from} className="an-range__label">
                    From
                  </label>
                  <input
                    id={ids.from}
                    aria-label="Batch from"
                    className="cr-search an-year"
                    inputMode="numeric"
                    placeholder={String(BATCH_MIN)}
                    value={batchFrom}
                    maxLength={4}
                    onChange={(e) => edit(setBatchFrom)(e.target.value.replace(/\D/g, ""))}
                  />
                  <label htmlFor={ids.to} className="an-range__label">
                    To
                  </label>
                  <input
                    id={ids.to}
                    aria-label="Batch to"
                    className="cr-search an-year"
                    inputMode="numeric"
                    placeholder={String(new Date().getFullYear())}
                    value={batchTo}
                    maxLength={4}
                    onChange={(e) => edit(setBatchTo)(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                {years === null ? (
                  <p className="cr-panel__error">
                    Enter years between {BATCH_MIN} and {MAX_BATCH_YEAR}, with From before To.
                  </p>
                ) : null}
              </div>
              <fieldset className="an-field an-fieldset">
                <legend className="cr-panel__label">Department</legend>
                <div className="an-chips">
                  {DEPARTMENTS.map((d) => {
                    const on = departments.includes(d.code);
                    return (
                      <label key={d.code} className={`an-chip${on ? " is-on" : ""}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            edit(setDepartments)(on ? departments.filter((c) => c !== d.code) : [...departments, d.code])
                          }
                        />
                        {d.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <CityPicker selected={cities} onChange={edit(setCities)} />
            </section>

            <section className="cr-panel an-preview" aria-live="polite" aria-labelledby="an-preview-title">
              <h2 id="an-preview-title" className="an-preview__count">
                {years === null
                  ? "Fix the batch years"
                  : preview.isError
                    ? "Couldn't count members"
                    : !preview.data || !previewFresh
                      ? "Counting…"
                      : `${count.toLocaleString("en-IN")} ${count === 1 ? "member matches" : "members match"}`}
              </h2>
              {preview.data && previewFresh && preview.data.sample.length > 0 ? (
                <p className="cr-panel__note">
                  Including{" "}
                  {preview.data.sample
                    .map((s) => [s.fullName?.trim() || "Unnamed member", s.batchYear ? `’${String(s.batchYear).slice(2)}` : null].filter(Boolean).join(" "))
                    .join(", ")}
                  {count > preview.data.sample.length ? "…" : ""}
                </p>
              ) : null}
            </section>

            {error ? (
              <p className="cr-panel__error" role="alert">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="cr-done" role="status">
                {notice}
              </p>
            ) : null}

            {step.kind === "confirm" ? (
              <div className="cr-panel an-confirm" role="group" aria-label="Confirm send">
                {step.changed ? (
                  <p className="cr-panel__error">The number of matching members changed. Check it and confirm again.</p>
                ) : null}
                <p className="an-confirm__question">{confirmQuestion(step.count, channels)}</p>
                <p className="cr-panel__note">
                  &ldquo;{content.title}&rdquo; · {filtersSummary(
                    {
                      batchYears: filters.batchYears ?? [],
                      departmentCodes: filters.departmentCodes ?? [],
                      places: cities,
                    },
                    departmentLabel
                  )}
                  . This can&apos;t be undone.
                </p>
                <div className="cr-actions">
                  <button type="button" className="cr-btn cr-btn--primary" disabled={busy} onClick={() => void send(step.count)}>
                    {busy ? "Sending…" : `Send to ${step.count.toLocaleString("en-IN")}`}
                  </button>
                  <button type="button" className="cr-btn" disabled={busy} onClick={resetToCompose}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : step.kind === "sent" ? (
              <p className="cr-done" role="status">
                Sent to {step.count.toLocaleString("en-IN")} {step.count === 1 ? "member" : "members"} by {CHANNEL_LABELS[step.channels]}.
                {step.channels !== "in_app" ? " Emails go out over the next few minutes; progress is in the history below." : ""}
              </p>
            ) : null}

            {step.kind !== "confirm" ? (
              <div className="cr-actions">
                <button type="button" className="cr-btn" disabled={busy || !contentReady} onClick={() => void sendTest()}>
                  Send test to me
                </button>
                <button
                  type="button"
                  className="cr-btn cr-btn--primary"
                  disabled={busy || !canSend}
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    setStep({ kind: "confirm", count });
                  }}
                >
                  Review and send
                </button>
              </div>
            ) : null}

            <section className="cr-section an-section" aria-labelledby="an-history">
              <h2 id="an-history" className="cr-section__title">
                History
              </h2>
              {history.isPending ? (
                <p className="cr-panel__note" role="status">Loading…</p>
              ) : history.isError ? (
                <div className="aa-message" role="alert">
                  <p className="cr-panel__text">Couldn&apos;t load the history.</p>
                  <button type="button" className="cr-btn" onClick={() => void history.refetch()}>
                    Try again
                  </button>
                </div>
              ) : history.data.length === 0 ? (
                <p className="cr-panel__note">Nothing sent yet.</p>
              ) : (
                <ul className="cr-list" aria-label="Sent announcements">
                  {history.data.map((a) => (
                    <HistoryCard key={a.id} a={a} open={openId === a.id} onToggle={() => setOpenId(openId === a.id ? null : a.id)} />
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
