import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BROKER_CONVERSATION_POLL_MS,
  brokerKeys,
  brokerRequestTitle,
  closeBrokerConversation,
  fetchBrokerConversation,
  markBrokerConversationRead,
  readOnlyLabel,
  sendBrokerMessage,
  type BrokerConversation,
} from "../../lib/broker";
import { queryKeys } from "../../lib/queryKeys";
import { formatThreadMessageTime } from "../../lib/threadMessageFormat";
import { Avatar } from "../Avatar";
import { Button } from "../Button";
import { PostBodyLinks } from "../PostBodyLinks";
import { COUNTER_FROM_SHARE, READ_ONLY_SOON_MS, trailingMine } from "../../lib/conversationUi";
// Starter messages are designed but their copy isn't decided: see lib/conversationUi.ts and StarterMessages.tsx.
// import { STARTER_MESSAGES_DRAFT } from "../../lib/conversationUi";
// import { StarterMessages } from "./StarterMessages";
import "../../styles/broker.css";

function firstNameOf(name: string): string {
  return name.split(/\s+/)[0] || name;
}

function soonDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.1 15 12 3.4 13.9z" />
    </svg>
  );
}

/** Two speech bubbles, for "Start the conversation". Decorative. */
function TalkIllustration() {
  return (
    <svg className="convo-empty__art" width="168" height="112" viewBox="0 0 168 112" fill="none" aria-hidden>
      <ellipse cx="80" cy="102" rx="46" ry="6" fill="#efe3d0" />
      <path d="M24 22c0-8 6-14 14-14h44c8 0 14 6 14 14v22c0 8-6 14-14 14H48l-14 11 3-11c-8-1-13-7-13-14V22Z" fill="#fbf3e6" stroke="#3a2a1e" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="47" cy="34" r="2.6" fill="#3a2a1e" />
      <circle cx="60" cy="34" r="2.6" fill="#3a2a1e" />
      <circle cx="73" cy="34" r="2.6" fill="#3a2a1e" />
      <path d="M144 52c0-8-6-14-14-14H92c-8 0-14 6-14 14v18c0 8 6 14 14 14h26l14 11-3-11c8-1 15-6 15-14V52Z" fill="#f3c9a8" stroke="#3a2a1e" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="100" cy="62" r="2.6" fill="#3a2a1e" />
      <circle cx="112" cy="62" r="2.6" fill="#3a2a1e" />
      <circle cx="124" cy="62" r="2.6" fill="#3a2a1e" />
      <path d="M128 14l-3 9M140 18l-7 7M146 31l-9 2" stroke="#3a2a1e" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7M3 12.5h18" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/**
 * One brokered request's conversation: only the asker and the helper who said yes can see it. Text
 * only, short messages, links stay as typed (clickable, never previewed). Nobody's contact is shared
 * unless they type it themselves. Either person can close it; it goes read-only when it goes quiet.
 */
export function BrokerConversationThread({ requestId }: { requestId: string }) {
  const queryClient = useQueryClient();
  const composerId = useId();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const q = useQuery({
    queryKey: brokerKeys.conversation(requestId),
    queryFn: ({ signal }) => fetchBrokerConversation(requestId, signal),
    refetchInterval: (query) => (query.state.data?.state === "open" ? BROKER_CONVERSATION_POLL_MS : false),
    refetchOnWindowFocus: true,
  });
  const c = q.data ?? null;

  /** Lists, cards and the bell all show unread counts: refresh them after anything changes here. */
  const refreshAround = () => {
    void queryClient.invalidateQueries({ queryKey: brokerKeys.requests() });
    void queryClient.invalidateQueries({ queryKey: brokerKeys.asks() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
  };

  // Seeing new messages reads them: the unread count and the message notification clear.
  const unread = c?.unreadCount ?? 0;
  const lastMessageAt = c?.lastMessageAt ?? null;
  useEffect(() => {
    if (unread === 0) return;
    let cancelled = false;
    void markBrokerConversationRead(requestId).then(({ error: err }) => {
      if (cancelled || err) return;
      queryClient.setQueryData<BrokerConversation>(brokerKeys.conversation(requestId), (old) => (old ? { ...old, unreadCount: 0 } : old));
      void queryClient.invalidateQueries({ queryKey: brokerKeys.requests() });
      void queryClient.invalidateQueries({ queryKey: brokerKeys.asks() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    });
    return () => {
      cancelled = true;
    };
  }, [requestId, unread, lastMessageAt, queryClient]);

  const messageCount = c?.messages.length ?? 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [messageCount]);

  if (q.isPending) {
    return (
      <p className="broker-note" role="status">
        Loading the conversation…
      </p>
    );
  }
  if (!c) {
    return (
      <div className="broker-convo__missing">
        <p className="broker-note broker-note--warn" role="alert">
          This conversation isn&apos;t available. Only the member who asked and the alum who said yes can see it.
        </p>
        <Link to="/notifications#your-requests" className="broker-convo__back-link">
          Back to your requests
        </Link>
      </div>
    );
  }

  const name = c.counterpart.fullName?.trim() || "An alum";
  const first = firstNameOf(name);
  const max = c.limits.maxChars;
  const trimmed = draft.trim();
  const tooLong = trimmed.length > max;

  const send = async () => {
    if (!trimmed || tooLong || sending || !c.canSend) return;
    setSending(true);
    setError(null);
    const { data, error: err } = await sendBrokerMessage(requestId, trimmed);
    setSending(false);
    if (err || !data) {
      setError(err?.message ?? "Couldn't send your message. Try again.");
      if (err?.code === "BROKER_CONVERSATION_READ_ONLY") void q.refetch();
      return;
    }
    setDraft("");
    queryClient.setQueryData<BrokerConversation>(brokerKeys.conversation(requestId), (old) =>
      old ? { ...old, messages: [...old.messages, data.message], messageCount: old.messageCount + 1, lastMessageAt: data.message.createdAt } : old,
    );
    void q.refetch();
    refreshAround();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void send();
    }
  };

  const close = async () => {
    setClosing(true);
    setError(null);
    const { error: err } = await closeBrokerConversation(requestId);
    setClosing(false);
    setConfirmClose(false);
    if (err) {
      setError(err.message ?? "Couldn't close the conversation. Try again.");
      return;
    }
    void q.refetch();
    refreshAround();
  };

  // Back to where this request lives for you: "Requests for you" (you said yes) or "Your requests" (you asked).
  const back =
    c.role === "helper"
      ? { label: "Requests for you", fallback: "/notifications#requests-for-you" }
      : { label: "Your requests", fallback: "/notifications#your-requests" };
  const goBack = () => (location.key === "default" ? navigate(back.fallback, { replace: true }) : navigate(-1));

  const who = [c.counterpart.institutionName, c.counterpart.batchYear ? `Class of ${c.counterpart.batchYear}` : null].filter(Boolean).join(" · ");
  // Limits show only when they apply (no permanent rules line).
  const showCounter = draft.length >= Math.floor(max * COUNTER_FROM_SHARE);
  const waitingForReply = !c.readOnlyReason && trailingMine(c.messages) >= c.limits.maxUnanswered;
  const readOnlySoon =
    // Measured from when this conversation was last loaded (it refreshes while open).
    !c.readOnlyReason && c.readOnlyAt && Date.parse(c.readOnlyAt) - q.dataUpdatedAt < READ_ONLY_SOON_MS ? c.readOnlyAt : null;
  // const starters = STARTER_MESSAGES_DRAFT[c.role][c.request.kind];
  // const pickStarter = (text: string) => {
  //   setDraft(text);
  //   composerRef.current?.focus();
  // };

  return (
    <div className="broker-convo convo-card">
      <div className="convo-card__bar">
        <button type="button" className="convo-card__back" onClick={goBack}>
          <BackIcon />
          <span>{back.label}</span>
        </button>
      </div>

      <header className="convo-head">
        <div className="convo-head__person">
          <Avatar name={name} size="lg" className="convo-head__avatar" />
          <div className="convo-head__who">
            <h1 className="broker-convo__title">
              <Link to={`/profiles/${c.counterpart.personId}`}>{name}</Link>
            </h1>
            {who ? <p className="convo-head__meta">{who}</p> : null}
          </div>
        </div>
        <p className="convo-head__request">
          <BriefcaseIcon />
          <span className="broker-header-line">{brokerRequestTitle(c.request)}</span>
        </p>
        <p className="convo-head__privacy">
          <LockIcon />
          <span>
            {c.role === "asker" ? `${first} said yes to your request.` : `You said yes to ${first}'s request.`} Just you and {first} are in this
            conversation. Contact details stay private unless you choose to share them.
          </span>
        </p>
      </header>

      {c.messages.length === 0 ? (
        <section className="convo-empty" aria-labelledby={`${composerId}-start`}>
          <TalkIllustration />
          <h2 id={`${composerId}-start`} className="convo-empty__title">
            Start the conversation
          </h2>
          <p className="convo-empty__copy">
            {c.role === "asker"
              ? `Say thanks, and share what would help ${first}: the job ID, your résumé link, or a good time to talk.`
              : `${first} will see your message here. Share only what the request needs.`}
          </p>
          {/* Starter messages: designed, copy not decided yet (see StarterMessages.tsx).
          {c.canSend ? <StarterMessages options={starters} onPick={pickStarter} /> : null} */}
        </section>
      ) : (
        <ol className="broker-convo__messages" aria-label="Messages">
          {c.messages.map((m) => (
            <li key={m.id} className={`broker-convo__msg${m.mine ? " broker-convo__msg--mine" : ""}`}>
              <span className="visually-hidden">{m.mine ? "You:" : `${first}:`}</span>
              <p className="broker-convo__body">
                <PostBodyLinks text={m.body} />
              </p>
              <time className="broker-convo__time" dateTime={m.createdAt}>
                {formatThreadMessageTime(m.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
      <div ref={bottomRef} />

      {error ? (
        <p className="broker-note broker-note--warn" role="alert">
          {error}
        </p>
      ) : null}

      {c.readOnlyReason ? (
        <p className="broker-convo__readonly" role="status">
          {readOnlyLabel(c.readOnlyReason, name, c.limits.inactiveDays)}
        </p>
      ) : (
        <form
          className="broker-convo__composer convo-composer"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {waitingForReply ? (
            <p className="convo-composer__notice" role="status">
              You&apos;ve sent {c.limits.maxUnanswered} messages in a row. You can write again once {first} replies.
            </p>
          ) : readOnlySoon ? (
            <p className="convo-composer__notice">
              No messages for a while: this conversation goes read-only on {soonDate(readOnlySoon)} unless one of you writes.
            </p>
          ) : null}
          <label htmlFor={composerId} className="visually-hidden">
            Message {first}
          </label>
          <div className="convo-composer__box">
            <textarea
              id={composerId}
              ref={composerRef}
              className="convo-composer__input"
              rows={2}
              value={draft}
              maxLength={max}
              placeholder="Write a message…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <button
              type="submit"
              className="convo-composer__send"
              aria-label={sending ? "Sending" : "Send"}
              disabled={sending || !trimmed || tooLong || waitingForReply}
            >
              <SendIcon />
            </button>
          </div>
          {showCounter ? (
            <span className={`broker-convo__count${tooLong ? " broker-note--warn" : ""}`} aria-live="polite">
              {trimmed.length} / {max}
            </span>
          ) : null}
        </form>
      )}

      {c.readOnlyReason ? null : confirmClose ? (
        <div className="broker-convo__close" role="group" aria-label="Close this conversation">
          <p className="broker-note">Close it? Neither of you can send messages after that. You can both still read it.</p>
          <div className="broker-card__actions">
            <Button type="button" variant="secondary" disabled={closing} onClick={() => setConfirmClose(false)}>
              Keep it open
            </Button>
            <Button type="button" variant="danger" disabled={closing} onClick={() => void close()}>
              {closing ? "Closing…" : "Close conversation"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="broker-convo__close">
          <button type="button" className="convo-card__quiet" onClick={() => setConfirmClose(true)}>
            Close conversation
          </button>
        </div>
      )}
    </div>
  );
}
