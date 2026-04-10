import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { assertApiGet } from "../lib/assertApiGet";
import { queryKeys } from "../lib/queryKeys";
import type { ConnectionThreadsListResponse } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { Avatar } from "./Avatar";

export function GlobalMessagingWidget() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);

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
  if (threadsQuery.isPending || threadsQuery.isError || !threadsQuery.data || threadsQuery.data.length === 0) return null;

  const threads = threadsQuery.data;
  const userDisplayName = auth.myProfile?.fullName?.trim() || auth.person.institutionalEmail;
  const myPersonId = auth.person.personId;

  return (
    <aside
      className={`global-messaging-widget${expanded ? " global-messaging-widget--expanded" : ""}`}
      aria-label="Messaging"
    >
      <button
        type="button"
        className="global-messaging-widget__head"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? "Collapse messaging" : "Expand messaging"}
        aria-expanded={expanded}
      >
        <div className="global-messaging-widget__head-main">
          <Avatar name={userDisplayName} size="sm" />
          <h2 className="global-messaging-widget__title">Messaging</h2>
        </div>
      </button>
      {expanded ? (
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
                  {thread.kind === "referral" ? <span className="global-messaging-widget__tag">Referral</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </aside>
  );
}

