import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { assertApiGet } from "../lib/assertApiGet";
import { queryKeys } from "../lib/queryKeys";
import type { ConnectionThreadsListResponse } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { Avatar } from "./Avatar";

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

export function GlobalMessagingWidget() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const hiddenOnRoutes = useMemo(() => {
    const p = location.pathname;
    return p === "/" || p.startsWith("/login") || p.startsWith("/auth/verify") || p.startsWith("/onboarding");
  }, [location.pathname]);

  const threadsQuery = useQuery({
    queryKey: queryKeys.connectionThreads.list(),
    queryFn: ({ signal }) => assertApiGet<ConnectionThreadsListResponse>("/v1/connection-threads", signal),
    enabled: auth.status === "authenticated" && !hiddenOnRoutes,
    select: (r) => r.threads.filter((t) => t.status === "open").slice(0, 3),
  });

  if (auth.status !== "authenticated" || hiddenOnRoutes) return null;
  const threads = threadsQuery.data ?? [];
  const myPersonId = auth.person.personId;
  const hasThreads = !threadsQuery.isPending && !threadsQuery.isError && threads.length > 0;

  return (
    <aside className="global-messaging-widget" aria-label="Messaging">
      <button
        type="button"
        className="global-messaging-widget__launcher"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? "Close messaging" : "Open messaging"}
        aria-expanded={expanded}
      >
        <ChatBubbleIcon />
        {hasThreads ? <span className="global-messaging-widget__launcher-dot" aria-hidden /> : null}
      </button>
      {expanded ? (
        <div className="global-messaging-widget__panel">
          <button
            type="button"
            className="global-messaging-widget__head"
            onClick={() => setExpanded(false)}
            aria-label="Collapse messaging"
          >
            <div className="global-messaging-widget__head-main">
              <ChatBubbleIcon />
              <h2 className="global-messaging-widget__title">Messaging</h2>
            </div>
          </button>
          {threadsQuery.isPending ? (
            <p className="global-messaging-widget__empty">Loading conversations…</p>
          ) : hasThreads ? (
            <ul className="global-messaging-widget__list" role="list">
              {threads.map((thread) => {
                const counterpartyName = thread.counterpartyFullName?.trim() || "Alumni";
                return (
                  <li key={thread.id}>
                    <button
                      type="button"
                      className="global-messaging-widget__row"
                      onClick={() => navigate(`/connections/${thread.id}`)}
                    >
                      <span className="global-messaging-widget__person">
                        <Avatar name={counterpartyName} size="sm" />
                        <span className="global-messaging-widget__person-text">
                          <span className="global-messaging-widget__name">{counterpartyName}</span>
                          <span className="global-messaging-widget__preview">
                            {thread.lastMessageAuthorPersonId === myPersonId ? "You: " : ""}
                            {thread.lastMessageBody.trim().replace(/\s+/g, " ")}
                          </span>
                        </span>
                      </span>
                      {thread.kind === "referral" ? (
                        <span className="global-messaging-widget__tag">Referral</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="global-messaging-widget__empty">
              No active chats yet. Start from any alumni profile.
            </p>
          )}
        </div>
      ) : null}
    </aside>
  );
}

