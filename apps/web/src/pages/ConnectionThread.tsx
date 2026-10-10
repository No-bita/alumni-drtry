import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { DeptBatchMeta } from "../components/DeptBatchMeta";
import {
  api,
  type AvailableDisclosureOption,
  type ConnectionThreadDetailResponse,
  type ConnectionThreadMessageReplyTo,
} from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";
import { assertApiGet } from "../lib/assertApiGet";
import { invalidateConnectionThreadQueries } from "../lib/invalidateAppQueries";
import { queryKeys } from "../lib/queryKeys";
import { THREAD_REFRESH_OPTIONS } from "../lib/threadRefresh";
import { demoDisplayFullName } from "../lib/demoProfile";
import { formatThreadMessageTime, replySnippet } from "../lib/threadMessageFormat";
import { trackBetaUsageEvent } from "../lib/betaAnalytics";
import { DemoAuthorBadge } from "../components/DemoAuthorBadge";

function disclosureLabel(kind: string): string {
  switch (kind) {
    case "institutional_email":
      return "Institutional email";
    case "personal_email":
      return "Personal email";
    case "mobile_phone":
      return "Mobile number";
    case "profile_link":
      return "Profile link";
    default:
      return kind;
  }
}

export function ConnectionThread() {
  const { threadId } = useParams<{ threadId: string }>();
  const auth = useAuth();
  const navName =
    auth.status === "authenticated" ? displayFirstNameFromEmail(auth.person.institutionalEmail) : undefined;

  if (!threadId) {
    return (
      <>
        <Nav variant="home" avatarName={navName} />
        <p className="body-text" style={{ padding: "2rem var(--page-x)" }}>
          Invalid conversation.
        </p>
      </>
    );
  }

  return <ConnectionThreadBody key={threadId} threadId={threadId} navName={navName} />;
}

function ConnectionThreadBody({
  threadId,
  navName,
}: {
  threadId: string;
  navName: string | undefined;
}) {
  const navigate = useNavigate();
  const auth = useAuth();
  const myPersonId = auth.status === "authenticated" ? auth.person.personId : null;

  const [composer, setComposer] = useState("");
  const [pendingReplyParent, setPendingReplyParent] = useState<ConnectionThreadMessageReplyTo | null>(null);
  const [sending, setSending] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [selectedShare, setSelectedShare] = useState<Set<string>>(() => new Set());
  const [shareBusy, setShareBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const detailQuery = useQuery({
    queryKey: queryKeys.connectionThreads.detail(threadId ?? ""),
    queryFn: ({ signal }) => {
      if (!threadId) throw new Error("Missing thread");
      return assertApiGet<ConnectionThreadDetailResponse>(`/v1/connection-threads/${threadId}`, signal);
    },
    enabled: Boolean(threadId),
    ...THREAD_REFRESH_OPTIONS,
  });

  const detail = detailQuery.data ?? null;
  const loadError =
    detailQuery.isError && !detail
      ? ((detailQuery.error as Error).message ?? "Could not load conversation.")
      : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages.length]);

  const sendMessage = async () => {
    if (!threadId || !composer.trim() || sending) return;
    const trimmed = composer.trim();
    const replySnapshot = pendingReplyParent;
    setSending(true);
    setActionError(null);
    const payload: { body: string; replyToMessageId?: string } = { body: trimmed };
    if (replySnapshot) payload.replyToMessageId = replySnapshot.messageId;
    const { error } = await api.post(`/v1/connection-threads/${threadId}/messages`, payload);
    setSending(false);
    if (error) {
      setActionError(error.message ?? error.code);
      return;
    }
    setComposer("");
    setPendingReplyParent(null);
    invalidateConnectionThreadQueries();
  };

  const dismissNudge = async () => {
    if (!threadId) return;
    setActionError(null);
    const { error } = await api.post(`/v1/connection-threads/${threadId}/nudge/dismiss`, {});
    if (error) {
      setActionError(error.message ?? error.code);
      return;
    }
    invalidateConnectionThreadQueries();
  };

  const toggleShareKey = (opt: AvailableDisclosureOption) => {
    const key =
      opt.kind === "profile_link" ? `profile_link:${opt.profileLinkId}` : opt.kind;
    setSelectedShare((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isShareSelected = (opt: AvailableDisclosureOption) => {
    const key =
      opt.kind === "profile_link" ? `profile_link:${opt.profileLinkId}` : opt.kind;
    return selectedShare.has(key);
  };

  const submitShare = async () => {
    if (!threadId || selectedShare.size === 0) return;
    const items: { kind: string; profileLinkId?: string }[] = [];
    for (const key of selectedShare) {
      if (key === "institutional_email") items.push({ kind: "institutional_email" });
      else if (key === "personal_email") items.push({ kind: "personal_email" });
      else if (key === "mobile_phone") items.push({ kind: "mobile_phone" });
      else if (key.startsWith("profile_link:")) {
        items.push({ kind: "profile_link", profileLinkId: key.slice("profile_link:".length) });
      }
    }
    setShareBusy(true);
    setActionError(null);
    const { error } = await api.post(`/v1/connection-threads/${threadId}/disclose`, { items });
    setShareBusy(false);
    if (error) {
      setActionError(error.message ?? error.code);
      return;
    }
    setShareOpen(false);
    setSelectedShare(new Set());
    invalidateConnectionThreadQueries();
  };

  const endConversation = async (status: "closed" | "declined") => {
    if (!threadId || !window.confirm(status === "declined" ? "Decline and close this conversation?" : "End this conversation?")) return;
    setActionError(null);
    const { error } = await api.post(`/v1/connection-threads/${threadId}/close`, { status });
    if (error) {
      setActionError(error.message ?? error.code);
      return;
    }
    trackBetaUsageEvent("thread_closed", { status, threadId });
    invalidateConnectionThreadQueries();
  };

  if (loadError && !detail) {
    return (
      <>
        <Nav variant="home" avatarName={navName} />
        <div className="connection-thread-page">
          <p className="body-text" style={{ color: "var(--brick)" }}>
            {loadError}
          </p>
          <Link to="/home" className="home-dashboard__text-link" style={{ marginTop: 12, display: "inline-block" }}>
            Back to Home
          </Link>
        </div>
      </>
    );
  }

  if (!myPersonId || detailQuery.isPending || !detail) {
    return (
      <>
        <Nav variant="home" avatarName={navName} />
        <div className="connection-thread-page">
          <p className="body-text" style={{ color: "var(--ink-muted)" }}>
            Loading…
          </p>
        </div>
      </>
    );
  }

  const {
    thread,
    counterpartyFullName,
    messages,
    disclosures,
    showShareNudge,
    showOfflineContactPrompt,
    messagesDeletionWarning,
    referralReplyCount,
    availableDisclosures,
    kind,
  } = detail;
  const isOpen = thread.status === "open";
  const counterpartyDisplayName =
    demoDisplayFullName(counterpartyFullName).trim() || counterpartyFullName?.trim() || "";
  const title = counterpartyDisplayName || "Conversation";
  return (
    <>
      <Nav variant="home" avatarName={navName} />
      <div className="connection-thread-page">
        <header className="connection-thread-page__head">
          <button type="button" className="connection-thread-page__back" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <h1 className="connection-thread-page__title">{title}</h1>
          <DeptBatchMeta
            as="p"
            className="connection-thread-page__meta dept-batch-meta"
            departmentCode={detail.counterpartyDepartmentCode}
            batchYear={detail.counterpartyBatchYear}
          />
          <p className="connection-thread-page__sub">
            <Link to={`/profiles/${detail.counterpartyPersonId}`} className="home-dashboard__text-link">
              View profile
            </Link>
          </p>
          {kind === "referral" ? <p className="connection-thread-page__tag">Referral chat</p> : null}
        </header>

        {actionError ? (
          <p className="connection-thread-page__error" role="alert">
            {actionError}
          </p>
        ) : null}

        {!isOpen ? (
          <p className="connection-thread-page__closed-banner">
            This conversation is {thread.status === "declined" ? "declined" : "closed"}.
          </p>
        ) : null}

        {messagesDeletionWarning ? (
          <p className="connection-thread-page__retention-banner" role="status">
            {messagesDeletionWarning}
          </p>
        ) : null}

        {disclosures.length > 0 ? (
          <section className="connection-thread-page__disclosures" aria-label="Shared contact">
            {disclosures.some((d) => d.personId !== myPersonId) ? (
              <>
                <h2 className="connection-thread-page__section-title">They shared</h2>
                <ul className="connection-thread-page__disclosure-list">
                  {disclosures
                    .filter((d) => d.personId !== myPersonId)
                    .map((d) => (
                      <li key={d.id} className="connection-thread-page__disclosure-item">
                        <span className="connection-thread-page__disclosure-kind">{disclosureLabel(d.kind)}</span>
                        {d.kind === "profile_link" ? (
                          <a
                            href={d.disclosedValue}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="connection-thread-page__disclosure-value"
                          >
                            Open link
                          </a>
                        ) : (
                          <span className="connection-thread-page__disclosure-value">{d.disclosedValue}</span>
                        )}
                      </li>
                    ))}
                </ul>
              </>
            ) : null}
            {disclosures.some((d) => d.personId === myPersonId) ? (
              <>
                <h2
                  className="connection-thread-page__section-title"
                  style={{ marginTop: disclosures.some((d) => d.personId !== myPersonId) ? "var(--space-lg)" : 0 }}
                >
                  You shared
                </h2>
                <ul className="connection-thread-page__disclosure-list">
                  {disclosures
                    .filter((d) => d.personId === myPersonId)
                    .map((d) => (
                      <li key={d.id} className="connection-thread-page__disclosure-item">
                        <span className="connection-thread-page__disclosure-kind">{disclosureLabel(d.kind)}</span>
                        {d.kind === "profile_link" ? (
                          <a
                            href={d.disclosedValue}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="connection-thread-page__disclosure-value"
                          >
                            Open link
                          </a>
                        ) : (
                          <span className="connection-thread-page__disclosure-value">{d.disclosedValue}</span>
                        )}
                      </li>
                    ))}
                </ul>
              </>
            ) : null}
          </section>
        ) : null}

        <ul className="connection-thread-page__messages" aria-label="Messages">
          {messages.map((m) => {
            const mine = m.authorPersonId === myPersonId;
            const replyTo = m.replyTo;
            return (
              <li
                key={m.id}
                className={`connection-thread-page__msg${mine ? " connection-thread-page__msg--mine" : ""}`}
              >
                {replyTo ? (
                  <div
                    className="connection-thread-page__reply-quote"
                    role="note"
                    aria-label={`Quoted: ${replySnippet(replyTo.body)}`}
                  >
                    <span className="connection-thread-page__reply-quote-bar" aria-hidden />
                    <p className="connection-thread-page__reply-quote-text">{replySnippet(replyTo.body)}</p>
                  </div>
                ) : null}
                <p className="connection-thread-page__msg-body">{m.body}</p>
                <div className="connection-thread-page__msg-meta-row">
                  <span className="connection-thread-page__msg-meta-lead">
                    <time className="connection-thread-page__msg-time" dateTime={m.createdAt}>
                      {formatThreadMessageTime(m.createdAt)}
                    </time>
                    {m.authorIsDemo ? <DemoAuthorBadge /> : null}
                  </span>
                  <button
                    type="button"
                    className="connection-thread-page__msg-reply"
                    onClick={() => {
                      trackBetaUsageEvent("message_reply_started", { threadId, messageId: m.id });
                      setPendingReplyParent({
                        messageId: m.id,
                        authorPersonId: m.authorPersonId,
                        body: m.body,
                      });
                    }}
                  >
                    Reply
                  </button>
                </div>
              </li>
            );
          })}
          <div ref={bottomRef} />
        </ul>

        {isOpen && showShareNudge ? (
          <div className="connection-thread-page__nudge" role="region" aria-label="Share contact suggestion">
            <p className="connection-thread-page__nudge-text">
              Would you like to share your LinkedIn or email?
            </p>
            <div className="connection-thread-page__nudge-actions">
              <Button type="button" variant="secondary" onClick={() => void dismissNudge()}>
                Not now
              </Button>
              <Button type="button" variant="primary" onClick={() => setShareOpen(true)} disabled={availableDisclosures.length === 0}>
                Choose what to share
              </Button>
            </div>
            {availableDisclosures.length === 0 ? (
              <p className="connection-thread-page__nudge-hint">
                Add a personal email or LinkedIn on your profile to share something here.
              </p>
            ) : null}
          </div>
        ) : null}

        {isOpen && showOfflineContactPrompt ? (
          <div className="connection-thread-page__nudge" role="status" aria-label="Referral offline prompt">
            <p className="connection-thread-page__nudge-text">
              You have replied {referralReplyCount} times. Please share contact details and take this conversation offline.
            </p>
          </div>
        ) : null}

        {isOpen ? (
          <div className="connection-thread-page__composer">
            {pendingReplyParent ? (
              <div className="connection-thread-page__reply-draft-banner">
                <div className="connection-thread-page__reply-draft-text">
                  <span className="connection-thread-page__reply-draft-label">Replying to</span>
                  <span className="connection-thread-page__reply-draft-snippet">
                    {replySnippet(pendingReplyParent.body)}
                  </span>
                </div>
                <button
                  type="button"
                  className="connection-thread-page__reply-draft-dismiss"
                  aria-label="Cancel reply"
                  onClick={() => setPendingReplyParent(null)}
                >
                  ×
                </button>
              </div>
            ) : null}
            <label className="ui-label input-field__label" htmlFor="connection-thread-composer">
              Message
            </label>
            <div className="connection-thread-page__composer-input-wrap">
              <textarea
                id="connection-thread-composer"
                className="input input--textarea connection-thread-page__composer-input"
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                rows={3}
                placeholder="Write a message..."
                maxLength={300}
              />
              <span className="connection-thread-page__composer-counter" aria-live="polite">
                {composer.length} / 300
              </span>
            </div>
            <div className="connection-thread-page__composer-actions">
              <Button type="button" variant="primary" disabled={sending || !composer.trim()} onClick={() => void sendMessage()}>
                {sending ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
        ) : null}

        {isOpen ? (
          <div className="connection-thread-page__footer-actions">
            <Button type="button" variant="secondary" onClick={() => void endConversation("closed")}>
              End conversation
            </Button>
            <Button type="button" variant="secondary" onClick={() => void endConversation("declined")}>
              Decline
            </Button>
          </div>
        ) : null}

        {shareOpen ? (
          <div className="connection-thread-page__modal-overlay" role="dialog" aria-modal="true" aria-labelledby="share-dialog-title">
            <div className="connection-thread-page__modal">
              <h2 id="share-dialog-title" className="connection-thread-page__modal-title">
                Choose what to share
              </h2>
              <p className="connection-thread-page__modal-desc">
                Only what you select is visible to {counterpartyDisplayName || "them"}. You can share more later.
              </p>
              <ul className="connection-thread-page__share-options">
                {availableDisclosures.map((opt) => (
                  <li key={opt.kind === "profile_link" ? opt.profileLinkId! : opt.kind}>
                    <label className="connection-thread-page__share-option">
                      <input
                        type="checkbox"
                        checked={isShareSelected(opt)}
                        onChange={() => toggleShareKey(opt)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="connection-thread-page__modal-actions">
                <Button type="button" variant="secondary" onClick={() => setShareOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={shareBusy || selectedShare.size === 0}
                  onClick={() => void submitShare()}
                >
                  {shareBusy ? "Sharing…" : "Share selected"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
