import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { assertApiGet } from "../lib/assertApiGet";
import { queryKeys } from "../lib/queryKeys";
import {
  api,
  type ConnectionThreadDetailResponse,
  type ConnectionThreadsListResponse,
  type ConnectionThreadMessageReplyTo,
  type CreateConnectionThreadResponse,
} from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { demoDisplayFullName } from "../lib/demoProfile";
import { formatThreadCompactTime, replySnippet } from "../lib/threadMessageFormat";
import { Avatar } from "./Avatar";
import { DeptBatchMeta } from "./DeptBatchMeta";

function ChatBubbleIcon() {
  return (
    <svg
      className="global-messaging-widget__icon"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-5.5 4v-4H4.5A1.5 1.5 0 0 1 3 16V7a1.5 1.5 0 0 1 1.5-1.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 11.5h8M8 8.5h5"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

type MessagingWidgetMode = "collapsed" | "list" | "expanded";

/** Dispatched via `window` as `messaging:open-draft` from hub pages / career flows. */
export type MessagingOpenDraftDetail =
  | { openPanelOnly: true }
  | {
      recipientPersonId: string;
      recipientName: string;
      initialMessage: string;
      kind?: "referral" | "general";
      /** Shown above the composer preview strip (e.g. the other person's request title). Not your draft body. */
      requestTitle?: string | null;
      /** Optional counterparty metadata passed from the source card/post. */
      recipientDepartmentCode?: string | null;
      recipientDepartmentName?: string | null;
      recipientBatchYear?: number | null;
    };

type OptimisticThreadMessage = {
  id: string;
  body: string;
  createdAt: string;
  status: "sending" | "delivered" | "seen" | "failed";
  replyTo: ConnectionThreadMessageReplyTo | null;
};

type MessageDeliveryStatus = "sending" | "delivered" | "seen" | "failed";
const MESSAGE_EDIT_WINDOW_MS = 10 * 60 * 1000;

export function GlobalMessagingWidget() {
  const auth = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<MessagingWidgetMode>("collapsed");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [composerDraft, setComposerDraft] = useState<{
    recipientPersonId: string;
    recipientName: string;
    initialMessage: string;
    kind: "referral" | "general";
    recipientDepartmentCode?: string | null;
    recipientDepartmentName?: string | null;
    recipientBatchYear?: number | null;
  } | null>(null);
  const [composerText, setComposerText] = useState("");
  const [composerSending, setComposerSending] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [threadComposer, setThreadComposer] = useState("");
  const [threadSending, setThreadSending] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingSaving, setEditingSaving] = useState(false);
  const [editingError, setEditingError] = useState<string | null>(null);
  const [listTab, setListTab] = useState<"all" | "unread">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [optimisticMessagesByThread, setOptimisticMessagesByThread] = useState<Record<string, OptimisticThreadMessage[]>>({});
  const [pendingReplyParent, setPendingReplyParent] = useState<ConnectionThreadMessageReplyTo | null>(null);
  /** Thread id for which `pendingReplyParent` applies; avoids syncing via effects when switching chats. */
  const [pendingReplyThreadId, setPendingReplyThreadId] = useState<string | null>(null);
  const [activeRequestPreview, setActiveRequestPreview] = useState<string | null>(null);

  const effectivePendingReply =
    pendingReplyParent && pendingReplyThreadId && activeThreadId === pendingReplyThreadId
      ? pendingReplyParent
      : null;

  function clearPendingReplyDraft() {
    setPendingReplyParent(null);
    setPendingReplyThreadId(null);
  }

  function collapseMessagingModal() {
    setActiveRequestPreview(null);
    setMode("collapsed");
  }

  const hiddenOnRoutes = useMemo(() => {
    const p = location.pathname;
    return p === "/" || p.startsWith("/login") || p.startsWith("/auth/verify") || p.startsWith("/onboarding");
  }, [location.pathname]);

  const threadsQuery = useQuery({
    queryKey: queryKeys.connectionThreads.list(),
    queryFn: ({ signal }) => assertApiGet<ConnectionThreadsListResponse>("/v1/connection-threads", signal),
    enabled: auth.status === "authenticated" && !hiddenOnRoutes,
    select: (r) => r.threads.filter((t) => t.status === "open"),
  });
  const threadDetailQuery = useQuery({
    queryKey: activeThreadId ? queryKeys.connectionThreads.detail(activeThreadId) : queryKeys.connectionThreads.detail("none"),
    queryFn: ({ signal }) => assertApiGet<ConnectionThreadDetailResponse>(`/v1/connection-threads/${activeThreadId}`, signal),
    enabled: auth.status === "authenticated" && !hiddenOnRoutes && mode === "expanded" && Boolean(activeThreadId),
  });
  const counterpartyDeptBatch = useMemo(() => {
    if (activeThreadId && threadDetailQuery.data?.thread.id === activeThreadId) {
      const d = threadDetailQuery.data;
      return {
        departmentCode: d.counterpartyDepartmentCode,
        batchYear: d.counterpartyBatchYear,
      };
    }
    if (activeThreadId) {
      const thread = (threadsQuery.data ?? []).find((t) => t.id === activeThreadId);
      if (!thread) return null;
      return {
        departmentCode: thread.counterpartyDepartmentCode,
        batchYear: thread.counterpartyBatchYear,
      };
    }
    if (composerDraft) {
      return {
        departmentCode: composerDraft.recipientDepartmentCode,
        batchYear: composerDraft.recipientBatchYear,
      };
    }
    return null;
  }, [activeThreadId, composerDraft, threadDetailQuery.data, threadsQuery.data]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    async function handleOpenDraft(event: Event) {
      const draftEvent = event as CustomEvent<MessagingOpenDraftDetail>;
      const detail = draftEvent.detail;
      if (!detail) return;

      if ("openPanelOnly" in detail && detail.openPanelOnly) {
        setComposerDraft(null);
        setComposerText("");
        setComposerError(null);
        setActiveThreadId(null);
        setThreadComposer("");
        setThreadError(null);
        setEditingMessageId(null);
        setEditingText("");
        setEditingError(null);
        clearPendingReplyDraft();
        setActiveRequestPreview(null);
        setMode("expanded");
        return;
      }

      if (!("recipientPersonId" in detail)) return;

      const normalized = {
        recipientPersonId: detail.recipientPersonId,
        recipientName: detail.recipientName,
        initialMessage: detail.initialMessage,
        kind: detail.kind ?? "referral",
        recipientDepartmentCode: detail.recipientDepartmentCode ?? null,
        recipientDepartmentName: detail.recipientDepartmentName ?? null,
        recipientBatchYear: detail.recipientBatchYear ?? null,
      };
      const requestPreviewTitle = detail.requestTitle?.trim() || null;

      const cachedThreads = threadsQuery.data ?? [];
      const cachedMatch = cachedThreads.find(
        (thread) => thread.counterpartyPersonId === normalized.recipientPersonId
      );
      if (cachedMatch) {
        const preview = requestPreviewTitle;
        setComposerDraft(null);
        setComposerText("");
        setActiveThreadId(cachedMatch.id);
        setThreadComposer(normalized.initialMessage ?? "");
        setThreadError(null);
        setEditingMessageId(null);
        setEditingText("");
        setEditingError(null);
        clearPendingReplyDraft();
        setActiveRequestPreview(preview);
        setMode("expanded");
        return;
      }
      try {
        const fresh = await queryClient.fetchQuery({
          queryKey: queryKeys.connectionThreads.list(),
          queryFn: ({ signal }) => assertApiGet<ConnectionThreadsListResponse>("/v1/connection-threads", signal),
        });
        const freshMatch = fresh.threads.find(
          (thread) => thread.counterpartyPersonId === normalized.recipientPersonId
        );
        if (freshMatch) {
          const preview = requestPreviewTitle;
          setComposerDraft(null);
          setComposerText("");
          setActiveThreadId(freshMatch.id);
          setThreadComposer(normalized.initialMessage ?? "");
          setThreadError(null);
          setEditingMessageId(null);
          setEditingText("");
          setEditingError(null);
          clearPendingReplyDraft();
          setActiveRequestPreview(preview);
          setMode("expanded");
          return;
        }
      } catch {
        // If list refresh fails, fall back to draft composer.
      }
      setComposerDraft(normalized);
      setComposerText(normalized.initialMessage ?? "");
      setComposerError(null);
      setActiveThreadId(null);
      setActiveRequestPreview(requestPreviewTitle);
      setMode("expanded");
    }
    window.addEventListener("messaging:open-draft", handleOpenDraft as EventListener);
    return () => window.removeEventListener("messaging:open-draft", handleOpenDraft as EventListener);
  }, [queryClient, threadsQuery.data]);

  async function sendDraftMessage() {
    if (!composerDraft || !composerText.trim() || composerSending) return;
    setComposerSending(true);
    setComposerError(null);
    const { data, error } = await api.post<CreateConnectionThreadResponse>("/v1/connection-threads", {
      recipientPersonId: composerDraft.recipientPersonId,
      initialMessage: composerText.trim(),
      kind: composerDraft.kind,
    });
    setComposerSending(false);
    if (error || !data?.threadId) {
      setComposerError(error?.message ?? error?.code ?? "Could not start conversation.");
      return;
    }
    setComposerDraft(null);
    setComposerText("");
    setActiveRequestPreview(null);
    void queryClient.invalidateQueries({ queryKey: queryKeys.connectionThreads.list() });
    setActiveThreadId(data.threadId);
    setThreadComposer("");
  }

  async function sendThreadMessage() {
    if (!activeThreadId || !threadComposer.trim() || threadSending) return;
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticBody = threadComposer.trim();
    const optimisticCreatedAt = new Date().toISOString();
    const replySnapshot = effectivePendingReply;
    setOptimisticMessagesByThread((prev) => ({
      ...prev,
      [activeThreadId]: [
        ...(prev[activeThreadId] ?? []),
        {
          id: optimisticId,
          body: optimisticBody,
          createdAt: optimisticCreatedAt,
          status: "sending",
          replyTo: replySnapshot,
        },
      ],
    }));
    setThreadComposer("");
    clearPendingReplyDraft();
    setActiveRequestPreview(null);
    setThreadSending(true);
    setThreadError(null);
    const messagePayload: { body: string; replyToMessageId?: string } = { body: optimisticBody };
    if (replySnapshot) messagePayload.replyToMessageId = replySnapshot.messageId;
    const { error } = await api.post(`/v1/connection-threads/${activeThreadId}/messages`, messagePayload);
    setThreadSending(false);
    if (error) {
      setOptimisticMessagesByThread((prev) => ({
        ...prev,
        [activeThreadId]: (prev[activeThreadId] ?? []).map((message) =>
          message.id === optimisticId ? { ...message, status: "failed" } : message
        ),
      }));
      setThreadError(error.message ?? error.code ?? "Could not send message.");
      return;
    }
    setOptimisticMessagesByThread((prev) => ({
      ...prev,
      [activeThreadId]: (prev[activeThreadId] ?? []).map((message) =>
        message.id === optimisticId ? { ...message, status: "delivered" } : message
      ),
    }));
    window.setTimeout(() => {
      setOptimisticMessagesByThread((prev) => ({
        ...prev,
        [activeThreadId]: (prev[activeThreadId] ?? []).filter((message) => message.id !== optimisticId),
      }));
      void queryClient.invalidateQueries({ queryKey: queryKeys.connectionThreads.detail(activeThreadId) });
    }, 700);
    void queryClient.invalidateQueries({ queryKey: queryKeys.connectionThreads.list() });
  }

  function canEditMessage(message: { id: string; authorPersonId: string; createdAt: string }): boolean {
    if (message.authorPersonId !== myPersonId || message.id.startsWith("optimistic-")) {
      return false;
    }
    const createdTime = new Date(message.createdAt).getTime();
    if (Number.isNaN(createdTime)) return false;
    return nowMs - createdTime <= MESSAGE_EDIT_WINDOW_MS;
  }

  function beginEditing(message: { id: string; body: string }) {
    clearPendingReplyDraft();
    setEditingMessageId(message.id);
    setEditingText(message.body);
    setEditingError(null);
  }

  function cancelEditing() {
    setEditingMessageId(null);
    setEditingText("");
    setEditingError(null);
  }

  async function saveEditedMessage() {
    if (!activeThreadId || !editingMessageId || editingSaving) return;
    const trimmed = editingText.trim();
    if (!trimmed) {
      setEditingError("Message cannot be empty.");
      return;
    }
    setEditingSaving(true);
    setEditingError(null);
    const { error } = await api.patch(`/v1/connection-threads/${activeThreadId}/messages/${editingMessageId}`, {
      body: trimmed,
    });
    setEditingSaving(false);
    if (error) {
      setEditingError(error.message ?? error.code ?? "Could not edit message.");
      return;
    }
    cancelEditing();
    void queryClient.invalidateQueries({ queryKey: queryKeys.connectionThreads.detail(activeThreadId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.connectionThreads.list() });
  }

  if (auth.status !== "authenticated" || hiddenOnRoutes) return null;
  const threads = threadsQuery.data ?? [];
  const myPersonId = auth.person.personId;
  const isThreadUnread = (thread: (typeof threads)[number]) => thread.lastMessageAuthorPersonId !== myPersonId;
  const unreadThreads = threads.filter(isThreadUnread);
  const allThreadCount = threads.length;
  const unreadThreadCount = unreadThreads.length;
  const baseVisibleThreads = listTab === "unread" ? unreadThreads : threads;
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const visibleThreads =
    normalizedSearchQuery.length === 0
      ? baseVisibleThreads
      : baseVisibleThreads.filter((thread) => {
          const raw = (thread.counterpartyFullName ?? "").trim();
          const display = demoDisplayFullName(thread.counterpartyFullName).trim() || raw;
          const haystack = `${display} ${raw}`.toLowerCase();
          return haystack.includes(normalizedSearchQuery);
        });
  const hasThreads = !threadsQuery.isPending && !threadsQuery.isError && threads.length > 0;
  const isListMode = mode === "list";
  const isExpandedMode = mode === "expanded";
  const selectedThread = activeThreadId ? threads.find((thread) => thread.id === activeThreadId) : null;
  const rawSelectedName =
    selectedThread?.counterpartyFullName?.trim() ||
    composerDraft?.recipientName?.trim() ||
    threadDetailQuery.data?.counterpartyFullName?.trim() ||
    "";
  const selectedName = demoDisplayFullName(rawSelectedName).trim() || rawSelectedName || "Alumni";

  /** Profile deep-link target for the conversation header name. */
  let counterpartyProfileId: string | null = composerDraft?.recipientPersonId ?? null;
  if (!counterpartyProfileId && activeThreadId) {
    const d = threadDetailQuery.data;
    if (d?.thread.id === activeThreadId) {
      counterpartyProfileId = d.counterpartyPersonId;
    } else if (selectedThread?.counterpartyPersonId) {
      counterpartyProfileId = selectedThread.counterpartyPersonId;
    }
  }
  const mergedThreadMessages = !activeThreadId
    ? []
    : [
        ...(threadDetailQuery.data?.messages ?? []).map((message) => ({
          id: message.id,
          body: message.body,
          createdAt: message.createdAt,
          editedAt: message.editedAt,
          authorPersonId: message.authorPersonId,
          replyTo: message.replyTo,
          optimisticStatus: resolveConfirmedMessageStatus(message),
        })),
        ...(optimisticMessagesByThread[activeThreadId] ?? []).map((message) => ({
          id: message.id,
          body: message.body,
          createdAt: message.createdAt,
          editedAt: null,
          authorPersonId: myPersonId,
          replyTo: message.replyTo ?? null,
          optimisticStatus: message.status,
        })),
      ]
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .slice(-40);

  function resolveConfirmedMessageStatus(message: { id: string; authorPersonId: string; body: string; createdAt: string }): MessageDeliveryStatus {
    const withPossibleReadSignals = message as {
      seenAt?: string | null;
      readAt?: string | null;
      deliveredAt?: string | null;
      isSeen?: boolean | null;
      isRead?: boolean | null;
      isDelivered?: boolean | null;
    };
    if (withPossibleReadSignals.isSeen || withPossibleReadSignals.isRead || Boolean(withPossibleReadSignals.seenAt) || Boolean(withPossibleReadSignals.readAt)) {
      return "seen";
    }
    if (withPossibleReadSignals.isDelivered === false) {
      return "sending";
    }
    if (withPossibleReadSignals.deliveredAt) {
      return "delivered";
    }
    return "delivered";
  }

  function renderThreadListRows(withSections: boolean) {
    if (threadsQuery.isPending) return <p className="global-messaging-widget__empty">Loading conversations…</p>;
    if (threadsQuery.isError) {
      const msg = threadsQuery.error instanceof Error ? threadsQuery.error.message : "Could not load conversations.";
      return (
        <div className="global-messaging-widget__empty">
          <p className="global-messaging-widget__composer-error">{msg}</p>
          <button type="button" className="btn btn--secondary" onClick={() => void threadsQuery.refetch()}>
            Retry
          </button>
        </div>
      );
    }
    if (!hasThreads) return <p className="global-messaging-widget__empty">No active chats yet. Start from any alumni profile.</p>;
    if (visibleThreads.length === 0) return <p className="global-messaging-widget__empty">No unread chats right now.</p>;
    const renderRows = (list: typeof visibleThreads) => (
      <ul className="global-messaging-widget__list" role="list">
        {list.map((thread) => {
          const rawCp = thread.counterpartyFullName?.trim() || "";
          const counterpartyName = demoDisplayFullName(thread.counterpartyFullName).trim() || rawCp || "Alumni";
          const unread = isThreadUnread(thread);
          return (
            <li key={thread.id}>
              <button
                type="button"
                className={`global-messaging-widget__row${activeThreadId === thread.id ? " global-messaging-widget__row--active" : ""}`}
                onClick={() => {
                  setComposerDraft(null);
                  setComposerText("");
                  setComposerError(null);
                  setActiveThreadId(thread.id);
                  setThreadComposer("");
                  setThreadError(null);
                  setEditingMessageId(null);
                  setEditingText("");
                  setEditingError(null);
                  setActiveRequestPreview(null);
                  setMode("expanded");
                }}
              >
                <span className="global-messaging-widget__person">
                  <Avatar name={counterpartyName} size="sm" />
                  <span className="global-messaging-widget__person-text">
                    <span className="global-messaging-widget__name-row">
                      <span className="global-messaging-widget__name">{counterpartyName}</span>
                      <span className="global-messaging-widget__row-time">{formatThreadCompactTime(thread.updatedAt)}</span>
                    </span>
                    <span className="global-messaging-widget__preview">
                      {thread.lastMessageAuthorPersonId === myPersonId ? "You: " : ""}
                      {thread.lastMessageBody.trim().replace(/\s+/g, " ")}
                    </span>
                  </span>
                </span>
                <span className="global-messaging-widget__row-meta">
                  {unread ? <span className="global-messaging-widget__unread">1</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
    if (!withSections) return renderRows(visibleThreads);
    return (
      <>
        <section className="global-messaging-widget__section">
          <p className="global-messaging-widget__section-label">Recent</p>
          {renderRows(visibleThreads)}
        </section>
      </>
    );
  }

  return (
    <aside className="global-messaging-widget" aria-label="Messaging">
      <button
        type="button"
        className="global-messaging-widget__launcher"
        onClick={() => {
          if (mode === "collapsed") {
            setMode("list");
            return;
          }
          setMode("collapsed");
        }}
        aria-label={mode === "collapsed" ? "Open messaging" : "Close messaging"}
        aria-expanded={mode !== "collapsed"}
      >
        <ChatBubbleIcon />
        {hasThreads ? <span className="global-messaging-widget__launcher-dot" aria-hidden /> : null}
      </button>
      {isListMode ? (
        <div className="global-messaging-widget__panel global-messaging-widget__compact-panel">
          <div className="global-messaging-widget__head">
            <div className="global-messaging-widget__head-main">
              <ChatBubbleIcon />
              <div className="global-messaging-widget__head-copy">
                <h2 className="global-messaging-widget__title">Messaging</h2>
                <p className="global-messaging-widget__caption">Recent conversations</p>
              </div>
            </div>
            <button type="button" className="global-messaging-widget__collapse" onClick={() => setMode("collapsed")} aria-label="Collapse messaging">
              <span aria-hidden>×</span>
            </button>
          </div>
          <div className="global-messaging-widget__search-row">
            <input
              className="global-messaging-widget__search"
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <div className="global-messaging-widget__tabs">
            <button type="button" className={listTab === "all" ? "is-active" : ""} onClick={() => setListTab("all")}>
              All <span>{allThreadCount}</span>
            </button>
            <button type="button" className={listTab === "unread" ? "is-active" : ""} onClick={() => setListTab("unread")}>
              Unread <span>{unreadThreadCount}</span>
            </button>
          </div>
          {renderThreadListRows(true)}
        </div>
      ) : null}
      {isExpandedMode ? (
        <>
          <button
            type="button"
            className="global-messaging-widget__modal-backdrop"
            aria-label="Close messaging modal"
            onClick={() => collapseMessagingModal()}
          />
          <section className="global-messaging-widget__modal" role="dialog" aria-modal="true" aria-label="Messaging">
            <div className="global-messaging-widget__modal-left">
              <div className="global-messaging-widget__head">
                <div className="global-messaging-widget__head-main">
                  <ChatBubbleIcon />
                  <div className="global-messaging-widget__head-copy">
                    <h2 className="global-messaging-widget__title">Messaging</h2>
                    <p className="global-messaging-widget__caption">Recent conversations</p>
                  </div>
                </div>
              </div>
              <div className="global-messaging-widget__search-row">
                <input
                  className="global-messaging-widget__search"
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <div className="global-messaging-widget__tabs">
                <button type="button" className={listTab === "all" ? "is-active" : ""} onClick={() => setListTab("all")}>
                  All <span>{allThreadCount}</span>
                </button>
                <button type="button" className={listTab === "unread" ? "is-active" : ""} onClick={() => setListTab("unread")}>
                  Unread <span>{unreadThreadCount}</span>
                </button>
              </div>
              {renderThreadListRows(true)}
            </div>
            <div className="global-messaging-widget__modal-right">
              <div className="global-messaging-widget__modal-right-head">
                <div className="global-messaging-widget__active-thread">
                  <Avatar name={selectedName} size="sm" />
                  <div>
                    {counterpartyProfileId ? (
                      <Link
                        className="global-messaging-widget__active-name global-messaging-widget__active-name--link"
                        to={`/profiles/${counterpartyProfileId}`}
                        onClick={() => collapseMessagingModal()}
                      >
                        {selectedName}
                      </Link>
                    ) : (
                      <p className="global-messaging-widget__active-name">{selectedName}</p>
                    )}
                    {counterpartyDeptBatch ? (
                      <DeptBatchMeta
                        as="p"
                        className="global-messaging-widget__active-meta dept-batch-meta"
                        departmentCode={counterpartyDeptBatch.departmentCode}
                        batchYear={counterpartyDeptBatch.batchYear}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="global-messaging-widget__modal-right-actions">
                  <button type="button" className="global-messaging-widget__collapse" onClick={() => collapseMessagingModal()} aria-label="Close messaging">
                    <span aria-hidden>×</span>
                  </button>
                </div>
              </div>
              {activeThreadId ? (
                <div className="global-messaging-widget__thread">
                  {threadDetailQuery.isPending ? (
                    <p className="global-messaging-widget__empty">Loading chat…</p>
                  ) : threadDetailQuery.isError ? (
                    <div>
                      <p className="global-messaging-widget__composer-error">
                        {threadDetailQuery.error instanceof Error
                          ? threadDetailQuery.error.message
                          : "Could not load this chat."}
                      </p>
                      <button type="button" className="btn btn--secondary" onClick={() => void threadDetailQuery.refetch()}>
                        Retry
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="global-messaging-widget__day-chip">Today</div>
                      <div className="global-messaging-widget__thread-messages">
                        {mergedThreadMessages.map((message) => (
                          <div
                            key={message.id}
                            className={`global-messaging-widget__thread-row${
                              message.authorPersonId === myPersonId ? " global-messaging-widget__thread-row--mine" : ""
                            }`}
                          >
                            {message.authorPersonId === myPersonId ? null : <Avatar name={selectedName} size="sm" />}
                            <div className="global-messaging-widget__thread-bubble-wrap">
                              {editingMessageId === message.id ? (
                                <div className="global-messaging-widget__edit-wrap">
                                  <textarea
                                    className="global-messaging-widget__edit-input"
                                    value={editingText}
                                    maxLength={300}
                                    rows={3}
                                    onChange={(event) => setEditingText(event.target.value)}
                                  />
                                  <div className="global-messaging-widget__edit-actions">
                                    <button type="button" className="btn btn--ghost" onClick={cancelEditing} disabled={editingSaving}>
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn--secondary"
                                      onClick={() => void saveEditedMessage()}
                                      disabled={editingSaving || !editingText.trim()}
                                    >
                                      {editingSaving ? "Saving..." : "Save"}
                                    </button>
                                  </div>
                                  {editingError ? <p className="global-messaging-widget__composer-error">{editingError}</p> : null}
                                </div>
                              ) : (
                                <>
                                  {message.replyTo ? (
                                    <div
                                      className="global-messaging-widget__reply-quote"
                                      role="note"
                                      aria-label={`Quoted: ${replySnippet(message.replyTo.body)}`}
                                    >
                                      <span className="global-messaging-widget__reply-quote-bar" aria-hidden />
                                      <p className="global-messaging-widget__reply-quote-text">{replySnippet(message.replyTo.body)}</p>
                                    </div>
                                  ) : null}
                                  <p
                                    className={`global-messaging-widget__thread-message${
                                      message.authorPersonId === myPersonId ? " global-messaging-widget__thread-message--mine" : ""
                                    }`}
                                  >
                                    {message.body}
                                  </p>
                                </>
                              )}
                              <span className="global-messaging-widget__thread-statusline">
                                {message.authorPersonId === myPersonId ? (
                                  message.optimisticStatus === "sending" ? null : (
                                    <span
                                      className={`global-messaging-widget__thread-tick${
                                        message.optimisticStatus === "failed"
                                          ? " global-messaging-widget__thread-tick--failed"
                                          : ""
                                      }`}
                                    >
                                      {message.optimisticStatus === "failed"
                                        ? "!"
                                        : message.optimisticStatus === "seen"
                                          ? "✓✓"
                                          : "✓"}
                                    </span>
                                  )
                                ) : null}
                                <span className="global-messaging-widget__thread-time">{formatThreadCompactTime(message.createdAt)}</span>
                                {message.editedAt ? <span className="global-messaging-widget__thread-edited">(edited)</span> : null}
                                {editingMessageId !== message.id && !message.id.startsWith("optimistic-") ? (
                                  <button
                                    type="button"
                                    className="global-messaging-widget__thread-reply-btn"
                                    onClick={() => {
                                      if (!activeThreadId) return;
                                      setPendingReplyThreadId(activeThreadId);
                                      setPendingReplyParent({
                                        messageId: message.id,
                                        authorPersonId: message.authorPersonId,
                                        body: message.body,
                                      });
                                    }}
                                  >
                                    Reply
                                  </button>
                                ) : null}
                                {editingMessageId !== message.id && canEditMessage(message) ? (
                                  <button
                                    type="button"
                                    className="global-messaging-widget__thread-edit-btn"
                                    onClick={() => beginEditing(message)}
                                  >
                                    Edit
                                  </button>
                                ) : null}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="global-messaging-widget__thread-footer">
                        {effectivePendingReply ? (
                          <div className="global-messaging-widget__reply-draft-banner">
                            <div className="global-messaging-widget__reply-draft-banner-text">
                              <span className="global-messaging-widget__reply-draft-label">Replying to</span>
                              <span className="global-messaging-widget__reply-draft-snippet">
                                {replySnippet(effectivePendingReply.body)}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="global-messaging-widget__reply-draft-dismiss"
                              aria-label="Cancel reply"
                              onClick={() => clearPendingReplyDraft()}
                            >
                              ×
                            </button>
                          </div>
                        ) : null}
                        {!effectivePendingReply && activeRequestPreview ? (
                          <div className="global-messaging-widget__reply-draft-banner">
                            <div className="global-messaging-widget__reply-draft-banner-text">
                              <span className="global-messaging-widget__reply-draft-snippet">
                                {replySnippet(activeRequestPreview)}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="global-messaging-widget__reply-draft-dismiss"
                              aria-label="Hide request preview"
                              onClick={() => setActiveRequestPreview(null)}
                            >
                              ×
                            </button>
                          </div>
                        ) : null}
                        <div className="global-messaging-widget__composer-bar">
                          <button type="button" className="global-messaging-widget__composer-aux" aria-label="Add attachment">
                            +
                          </button>
                          <textarea
                            className="global-messaging-widget__composer-inline"
                            rows={2}
                            value={threadComposer}
                            onChange={(event) => setThreadComposer(event.target.value)}
                            placeholder="Type a message..."
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                void sendThreadMessage();
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="global-messaging-widget__composer-send"
                            disabled={threadSending || !threadComposer.trim()}
                            onClick={() => void sendThreadMessage()}
                          >
                            ➤
                          </button>
                        </div>
                        <p className="global-messaging-widget__composer-hint">Press Enter to send · Shift + Enter for new line</p>
                        {threadError ? <p className="global-messaging-widget__composer-error">{threadError}</p> : null}
                      </div>
                    </>
                  )}
                </div>
              ) : composerDraft ? (
                <div className="global-messaging-widget__composer global-messaging-widget__composer--draft">
                  <div className="global-messaging-widget__composer-body-spacer" />
                  <div className="global-messaging-widget__composer-footer">
                    {activeRequestPreview ? (
                      <div className="global-messaging-widget__reply-draft-banner">
                        <div className="global-messaging-widget__reply-draft-banner-text">
                          <span className="global-messaging-widget__reply-draft-snippet">
                            {replySnippet(activeRequestPreview)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="global-messaging-widget__reply-draft-dismiss"
                          aria-label="Hide request preview"
                          onClick={() => setActiveRequestPreview(null)}
                        >
                          ×
                        </button>
                      </div>
                    ) : null}
                    <div className="global-messaging-widget__composer-bar">
                      <button type="button" className="global-messaging-widget__composer-aux" aria-label="Add attachment">
                        +
                      </button>
                      <textarea
                        className="global-messaging-widget__composer-inline"
                        rows={2}
                        value={composerText}
                        onChange={(event) => setComposerText(event.target.value)}
                        placeholder="Type a message..."
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            void sendDraftMessage();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="global-messaging-widget__composer-send"
                        disabled={composerSending || !composerText.trim()}
                        onClick={() => void sendDraftMessage()}
                      >
                        ➤
                      </button>
                    </div>
                    <p className="global-messaging-widget__composer-hint">Press Enter to send · Shift + Enter for new line</p>
                    {composerError ? <p className="global-messaging-widget__composer-error">{composerError}</p> : null}
                  </div>
                </div>
              ) : (
                <p className="global-messaging-widget__empty">Choose a conversation on the left to start chatting.</p>
              )}
            </div>
          </section>
        </>
      ) : null}
    </aside>
  );
}
