import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ContactRequestsInboxResponse } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { assertApiGet } from "../lib/assertApiGet";
import { useBrokerAsks } from "../hooks/useBrokerAsks";
import { BrokerAskCards } from "./broker/BrokerSections";
import { LineIcon } from "./LineIcon";

/**
 * Home's "Requests for you": what other members want from you. Brokered referral and hiring asks
 * (Yes / Not this time on the card) and how many direct reachouts wait for your reply. Replies to
 * your own Wall posts stay in Notifications. Empty: one short line, the column stays.
 */
export function HomeRequestsPanel() {
  const auth = useAuth();
  const signedIn = auth.status === "authenticated";
  const asks = useBrokerAsks(signedIn);
  const inbox = useQuery({
    queryKey: ["contact-requests", "inbox"],
    queryFn: ({ signal }) => assertApiGet<ContactRequestsInboxResponse>("/v1/contact-requests/inbox", signal),
    enabled: signedIn,
  });
  const waiting = inbox.data?.requests.length ?? 0;
  const settled = asks.settled && (inbox.isSuccess || inbox.isError);
  const empty = asks.visible.length === 0 && waiting === 0;

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
      {!settled ? (
        <p className="home-requests__empty" role="status">
          Loading requests…
        </p>
      ) : empty ? (
        <p className="home-requests__empty">Nothing waiting for you right now.</p>
      ) : (
        <div className="home-requests__list">
          {waiting > 0 ? (
            <Link to="/notifications" className="home-requests__waiting" aria-label={`${waiting} waiting for your reply`}>
              <span>
                {waiting} {waiting === 1 ? "reachout" : "reachouts"} waiting for your reply
              </span>
              <LineIcon name="chevron" size={18} />
            </Link>
          ) : null}
          <BrokerAskCards state={asks} />
        </div>
      )}
    </section>
  );
}
