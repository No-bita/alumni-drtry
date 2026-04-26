import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { assertApiGet } from "../lib/assertApiGet";
import { queryKeys } from "../lib/queryKeys";
import type { ConnectionThreadsListResponse } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { Avatar } from "./Avatar";

function previewSnippet(text: string, max = 72): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function ConnectionThreadsList() {
  const auth = useAuth();
  const threadsQuery = useQuery({
    queryKey: queryKeys.connectionThreads.list(),
    queryFn: ({ signal }) => assertApiGet<ConnectionThreadsListResponse>("/v1/connection-threads", signal),
    enabled: auth.status === "authenticated",
    select: (r) => r.threads.filter((t) => t.status === "open"),
  });

  const myId = auth.status === "authenticated" ? auth.person.personId : null;

  if (threadsQuery.isPending || !myId) {
    return null;
  }

  const threads = threadsQuery.data ?? [];
  const hasThreads = !threadsQuery.isError && threads.length > 0;

  return (
    <section className="home-dashboard__inbox" aria-labelledby="home-threads-heading">
      <div className="home-dashboard__inbox-panel">
        <header className="home-dashboard__inbox-header">
          <h2 id="home-threads-heading" className="home-dashboard__inbox-title">
            Conversations
          </h2>
          <p className="home-dashboard__inbox-caption">Your chat entry point</p>
        </header>
        {hasThreads ? (
          <ul className="home-dashboard__thread-list">
            {threads.map((t) => {
              const name = t.counterpartyFullName?.trim() || "Alumni";
              const mine = t.lastMessageAuthorPersonId === myId;
              return (
                <li key={t.id}>
                  <Link to={`/connections/${t.id}`} className="home-dashboard__thread-row">
                    <span className="home-dashboard__thread-row-head">
                      <span className="home-dashboard__thread-row-person">
                        <Avatar name={name} size="sm" className="home-dashboard__thread-avatar" />
                        <span className="home-dashboard__thread-name">{name}</span>
                      </span>
                      {t.kind === "referral" ? <span className="home-dashboard__thread-tag">Referral</span> : null}
                    </span>
                    <span className="home-dashboard__thread-preview">
                      {mine ? "You: " : ""}
                      {previewSnippet(t.lastMessageBody)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="home-dashboard__inbox-caption">
            No active chats yet. Start from any alumni profile and your conversation will appear here.
          </p>
        )}
      </div>
    </section>
  );
}
