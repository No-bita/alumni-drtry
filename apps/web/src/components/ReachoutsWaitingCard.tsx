import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { HubSideCard } from "./HubSideCard";
import type { ContactRequestsInboxResponse } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { assertApiGet } from "../lib/assertApiGet";
import { careersKeys, fetchMyCompanyDemand } from "../lib/careers";
import { parseOpenToPreferences } from "../lib/openToPreferences";

/**
 * "Reachouts waiting for you" (Careers and Home): reachouts sent to you that wait for your reply, and
 * how many searches named your company. Shown to anyone who has said what they can help with, has
 * reachouts waiting, or works somewhere. The count shows even when it is 0.
 */
export function ReachoutsWaitingCard() {
  const auth = useAuth();
  const signedIn = auth.status === "authenticated";
  const inbox = useQuery({
    queryKey: ["contact-requests", "inbox"],
    queryFn: ({ signal }) => assertApiGet<ContactRequestsInboxResponse>("/v1/contact-requests/inbox", signal),
    enabled: signedIn,
  });
  const demand = useQuery({ queryKey: careersKeys.myCompanyDemand(), queryFn: ({ signal }) => fetchMyCompanyDemand(signal), enabled: signedIn });

  if (!signedIn) return null;
  const openTo = parseOpenToPreferences(auth.myProfile?.openToPreferences)?.selected ?? [];
  const waiting = inbox.data?.requests.length ?? 0;
  const myDemand = demand.data ?? null;
  if (!(openTo.length > 0 || waiting > 0 || myDemand !== null)) return null;

  return (
    <HubSideCard id="hub-reachouts-waiting-title" title="Reachouts waiting for you" icon="inbox" tone="warm">
      <p className="hub-card__note">Juniors and peers are looking for people like you.</p>
      <Link to="/notifications" className="hub-card__item hub-card__item--boxed" aria-label={`${waiting} waiting for your reply`}>
        <span className="hub-card__item-title">{waiting} waiting for your reply</span>
        <span className="hub-card__count" aria-hidden>
          {waiting}
        </span>
      </Link>
      {myDemand ? (
        <div className="hub-card__demand">
          <span className="hub-card__item-title">
            {myDemand.asks === 0
              ? `No searches for ${myDemand.company} in the last ${myDemand.days} days`
              : `${myDemand.asks} ${myDemand.asks === 1 ? "search" : "searches"} for ${myDemand.company} in the last ${myDemand.days} days`}
          </span>
          <span className="hub-card__meta">
            {openTo.includes("referrals")
              ? "You're open to referrals, so you can show up in those searches."
              : "Say you're open to referrals to show up in those searches."}
          </span>
        </div>
      ) : null}
      {auth.myProfile?.id ? (
        <Link to={`/profiles/${auth.myProfile.id}?edit=open-to`} className="hub-card__more">
          Offer help: update what you&apos;re open to
        </Link>
      ) : null}
    </HubSideCard>
  );
}
