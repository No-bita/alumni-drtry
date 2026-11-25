import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ContactRequestsInboxResponse } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { assertApiGet } from "../lib/assertApiGet";
import { invalidateNotificationRelatedQueries } from "../lib/invalidateAppQueries";
import { useNotificationsList } from "../lib/notificationsQueries";
import { queryKeys } from "../lib/queryKeys";
import { firstName, personLine, requestRows, rowMeta, type RequestRow } from "../lib/requestsForYou";
import { useBrokerAsks } from "../hooks/useBrokerAsks";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { ConversationLink } from "./broker/BrokerSections";
import { LineIcon } from "./LineIcon";
import "../styles/home-requests.css";

/** Rows shown on Home before "See all in Notifications". */
export const HOME_REQUESTS_MAX = 5;

/**
 * Home's "Requests for you": what other members want from you, as one list. Brokered referral and
 * hiring asks, and direct reachouts. Each is a compact row (who, what, New) that opens in place into
 * the full request: their note, the job description, what saying yes means, and Yes / Not this time.
 * Replies to your own Wall posts stay in Notifications. Empty: one short line, the column stays.
 */
export function HomeRequestsPanel() {
  const auth = useAuth();
  const signedIn = auth.status === "authenticated";
  const queryClient = useQueryClient();
  // Home shows a compact row first, so an ask counts as seen when it's opened, not when it's listed.
  const asks = useBrokerAsks(signedIn, { seenOnShow: false });
  const inbox = useQuery({
    queryKey: queryKeys.contactRequests.inbox(),
    queryFn: ({ signal }) => assertApiGet<ContactRequestsInboxResponse>("/v1/contact-requests/inbox", signal),
    enabled: signedIn,
  });
  // Same list as the bell (already loaded for its badge): a reachout is New while its notification is.
  const notifications = useNotificationsList(signedIn);

  const [openKey, setOpenKey] = useState<string | null>(null);
  // Closing a request puts focus back on its row.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const [noteBusy, setNoteBusy] = useState<string | null>(null);
  const [noteErrors, setNoteErrors] = useState<Record<string, string>>({});
  const [doneNotes, setDoneNotes] = useState<ReadonlySet<string>>(() => new Set());
  const [flash, setFlash] = useState<string | null>(null);

  const rows = useMemo(
    () => requestRows(asks.visible, (inbox.data?.requests ?? []).filter((r) => !doneNotes.has(r.id))),
    [asks.visible, inbox.data, doneNotes],
  );
  const unseenNotes = useMemo(
    () =>
      new Set(
        (notifications.data?.items ?? [])
          .filter((n) => n.kind === "contact_request_received" && n.unseen)
          .map((n) => (n.kind === "contact_request_received" ? n.contactRequestId : "")),
      ),
    [notifications.data],
  );
  const isNew = (row: RequestRow) =>
    !opened.has(row.key) &&
    (row.ask ? row.ask.status === "asked" && !row.ask.seenAt : row.inbox ? unseenNotes.has(row.inbox.id) : false);

  const settled = asks.settled && (inbox.isSuccess || inbox.isError);
  const shown = rows.slice(0, HOME_REQUESTS_MAX);
  const more = rows.length - shown.length;

  const open = (row: RequestRow) => {
    setOpenKey(row.key);
    setFocusKey(null);
    setOpened((s) => new Set(s).add(row.key));
    setFlash(null);
    if (row.ask) asks.markSeen(row.ask);
  };

  const answerNote = async (row: RequestRow, action: "accept" | "decline") => {
    if (!row.inbox) return;
    const id = row.inbox.id;
    setNoteBusy(row.key);
    setNoteErrors((e) => ({ ...e, [row.key]: "" }));
    const { error } = await api.patch(`/v1/contact-requests/${id}`, { action });
    setNoteBusy(null);
    if (error) {
      setNoteErrors((e) => ({ ...e, [row.key]: error.message ?? "Couldn't save your answer. Try again." }));
      return;
    }
    setDoneNotes((s) => new Set(s).add(id));
    setOpenKey(null);
    setFlash(
      action === "accept"
        ? `You said yes to ${row.person.name}. They can reach you by email now.`
        : `You declined ${firstName(row.person.name)}'s request.`,
    );
    invalidateNotificationRelatedQueries();
    void queryClient.invalidateQueries({ queryKey: queryKeys.contactRequests.all });
  };

  return (
    <section className="home-requests ds-surface-card" aria-labelledby="home-requests-heading">
      <header className="home-ideal__opportunities-header ds-section-head">
        <span className="hub-card__icon home-wall__icon" aria-hidden>
          <LineIcon name="mail" />
        </span>
        <div className="home-ideal__opportunities-headcopy">
          <h2 id="home-requests-heading" className="home-ideal__opportunities-title ds-title-lg">
            Requests for you
          </h2>
          <p className="home-ideal__opportunities-sub">Alumni who&apos;ve asked for your help or input.</p>
        </div>
      </header>
      {flash ? (
        <p className="home-requests__flash" role="status">
          {flash}
        </p>
      ) : null}
      {!settled ? (
        <p className="home-requests__empty" role="status">
          Loading requests…
        </p>
      ) : rows.length === 0 ? (
        <p className="home-requests__empty">Nothing waiting for you right now.</p>
      ) : (
        <>
          <ul className="home-requests__list" aria-label="Requests for you">
            {shown.map((row) => (
              <li key={row.key}>
                {openKey === row.key ? (
                  <RequestDetail
                    row={row}
                    busy={row.source === "ask" ? asks.busy === row.ask?.askId : noteBusy === row.key}
                    error={row.source === "ask" ? (asks.errors[row.ask!.askId] ?? "") : (noteErrors[row.key] ?? "")}
                    onClose={() => {
                      setOpenKey(null);
                      setFocusKey(row.key);
                    }}
                    onAnswer={(action) =>
                      row.ask ? void asks.answer(row.ask, action).then(() => action === "decline" && setOpenKey(null)) : void answerNote(row, action)
                    }
                  />
                ) : (
                  <RequestRowButton row={row} isNew={isNew(row)} focus={focusKey === row.key} onOpen={() => open(row)} />
                )}
              </li>
            ))}
          </ul>
          {more > 0 ? (
            <Link to="/notifications" className="home-requests__more">
              See {more} more in Notifications
            </Link>
          ) : null}
        </>
      )}
    </section>
  );
}

function RequestRowButton({ row, isNew, focus, onOpen }: { row: RequestRow; isNew: boolean; focus: boolean; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  return (
    <button ref={ref} type="button" className={`home-request${row.pending ? "" : " home-request--answered"}`} onClick={onOpen}>
      <Avatar name={row.person.name} size="sm" className="home-request__avatar" />
      <span className="home-request__copy">
        <span className="home-request__title">{row.title}</span>
        <span className="home-request__meta">{rowMeta(row.person)}</span>
      </span>
      {isNew ? <span className="home-request__new">New</span> : !row.pending ? <span className="home-request__said-yes">You said yes</span> : null}
      <span className="home-request__chevron" aria-hidden>
        <LineIcon name="chevron" size={18} />
      </span>
    </button>
  );
}

function RequestDetail({
  row,
  busy,
  error,
  onClose,
  onAnswer,
}: {
  row: RequestRow;
  busy: boolean;
  error: string;
  onClose: () => void;
  onAnswer: (action: "accept" | "decline") => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  const first = firstName(row.person.name);
  const titleId = `request-${row.key.replace(":", "-")}`;
  const who = personLine(row.person);
  const ask = row.ask;
  const yesLabel = ask ? (ask.kind === "referral" ? "Yes, I'll refer" : "Yes, I'm interested") : "Yes, I'll help";
  const consequence = ask
    ? "Your contact details stay private unless you choose to share them."
    : `Saying yes shares your email with ${first}, so they can reach you.`;

  return (
    <article
      className="home-request-detail"
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="home-request-detail__top">
        <span className="home-request-detail__label">{row.label}</span>
        <button type="button" className="home-request-detail__close" aria-label="Close request" onClick={onClose}>
          ×
        </button>
      </div>
      <h3 id={titleId} ref={titleRef} tabIndex={-1} className="home-request-detail__title">
        {row.title}
      </h3>
      <div className="home-request-detail__person">
        <Avatar name={row.person.name} size="md" className="home-request__avatar" />
        <div>
          <Link to={`/profiles/${row.person.personId}`} className="home-request-detail__name">
            {row.person.name}
          </Link>
          {who ? <p className="home-request-detail__who">{who}</p> : null}
        </div>
      </div>
      {row.note && row.note !== row.title ? (
        <div className="home-request-detail__note">
          <p className="home-request-detail__note-label">{first}&apos;s note</p>
          <p className="home-request-detail__note-text">{row.note}</p>
        </div>
      ) : null}
      {row.links.map((l) => (
        <a key={l.href} className="home-request-detail__link" href={l.href} target="_blank" rel="noopener noreferrer">
          <span className="home-request-detail__link-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </span>
          <span className="home-request-detail__link-copy">
            <span className="home-request-detail__link-label">{l.label}</span>
            {l.sub ? <span className="home-request-detail__link-sub">{l.sub}</span> : null}
          </span>
          <LineIcon name="chevron" size={18} />
        </a>
      ))}
      {ask && ask.status === "accepted" ? (
        <>
          <p className="home-request-detail__status" role="status">
            You said yes. We&apos;ve told {row.person.name}. Talk it through here; your contact details stay private unless you share them.
          </p>
          {ask.conversation ? (
            <div className="home-request-detail__actions">
              <ConversationLink requestId={ask.requestId} summary={ask.conversation} name={row.person.name} />
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="home-request-detail__privacy">
            <span className="home-request-detail__lock" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            </span>
            {consequence}
          </p>
          <div className="home-request-detail__actions">
            <Button type="button" variant="primary" disabled={busy} onClick={() => onAnswer("accept")}>
              {busy ? "…" : yesLabel}
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => onAnswer("decline")}>
              Not this time
            </Button>
          </div>
        </>
      )}
      {error ? (
        <p className="home-request-detail__error" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}
