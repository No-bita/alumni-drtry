import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
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
import { Button } from "../Button";
import { DeptBatchMeta } from "../DeptBatchMeta";
import { PostBodyLinks } from "../PostBodyLinks";
import "../../styles/broker.css";

function firstNameOf(name: string): string {
  return name.split(/\s+/)[0] || name;
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

  return (
    <div className="broker-convo">
      <header className="broker-convo__head">
        <p className="broker-header-line">{brokerRequestTitle(c.request)}</p>
        <h1 className="broker-convo__title">
          <Link to={`/profiles/${c.counterpart.personId}`}>{name}</Link>
        </h1>
        <DeptBatchMeta as="p" className="broker-card__meta dept-batch-meta" departmentCode={c.counterpart.departmentCode} batchYear={c.counterpart.batchYear} />
        <p className="broker-note">
          {c.role === "asker" ? `${first} said yes to your request.` : `You said yes to ${first}'s request.`} Only the two of you can see this
          conversation. Contact details stay private unless you choose to share them.
        </p>
      </header>

      <ol className="broker-convo__messages" aria-label="Messages">
        {c.messages.length === 0 ? (
          <li className="broker-convo__empty">
            {c.role === "asker"
              ? `Say thanks, and share what would help ${first}: the job ID, your résumé link, or a good time to talk.`
              : `Say hello. ${first} will see your message here.`}
          </li>
        ) : null}
        {c.messages.map((m) => (
          <li key={m.id} className={`broker-convo__msg${m.mine ? " broker-convo__msg--mine" : ""}`}>
            <span className="pp-visually-hidden">{m.mine ? "You:" : `${first}:`}</span>
            <p className="broker-convo__body">
              <PostBodyLinks text={m.body} />
            </p>
            <time className="broker-convo__time" dateTime={m.createdAt}>
              {formatThreadMessageTime(m.createdAt)}
            </time>
          </li>
        ))}
      </ol>
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
          className="broker-convo__composer"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label htmlFor={composerId} className="broker-convo__label">
            Message {first}
          </label>
          <textarea
            id={composerId}
            className="input input--textarea"
            rows={3}
            value={draft}
            maxLength={max}
            placeholder="Write a message…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="broker-convo__composer-row">
            <span className={`broker-convo__count${tooLong ? " broker-note--warn" : ""}`} aria-live="polite">
              {trimmed.length} / {max}
            </span>
            <Button type="submit" variant="primary" disabled={sending || !trimmed || tooLong}>
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
          <p className="broker-note">
            Text only. Links stay as typed. Goes read-only after {c.limits.inactiveDays} quiet days.
          </p>
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
          <Button type="button" variant="secondary" onClick={() => setConfirmClose(true)}>
            Close conversation
          </Button>
        </div>
      )}
    </div>
  );
}
