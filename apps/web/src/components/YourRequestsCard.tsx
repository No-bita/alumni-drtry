import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type IntentcastFeedResponse } from "../api/client";
import { HubSideCard } from "./HubSideCard";
import { assertApiGet } from "../lib/assertApiGet";
import { mapIntentcastToRow } from "../lib/careerFeedRow";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { queryKeys } from "../lib/queryKeys";
import {
  MY_BUSINESS_REQUESTS_PATH,
  RESOLVED_OUTCOMES,
  isBusinessPost,
  requestStep,
  type ResolvedOutcome,
} from "../lib/business";

type Props = {
  /** Called after a request is resolved, with the outcome's label (for the page notice). */
  onResolved?: (outcomeLabel: string) => void;
};

/**
 * "Your requests" (Business): your open Startups posts with their step (Open, or Has replies · N).
 * Resolve asks how it ended, then closes the post as resolved. Hidden when you have no open request.
 */
export function YourRequestsCard({ onResolved }: Props) {
  const queryClient = useQueryClient();
  const baseId = useId();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = useQuery({
    queryKey: queryKeys.business.myRequests(),
    queryFn: ({ signal }) => assertApiGet<IntentcastFeedResponse>(MY_BUSINESS_REQUESTS_PATH, signal),
  });
  const requests = (mine.data?.intentcasts ?? []).filter((p) => p.status === "open" && isBusinessPost(p));
  if (requests.length === 0) return null;

  const resolve = async (id: string, outcome: ResolvedOutcome) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await api.patch(`/v1/intentcasts/${id}/close`, { outcome });
      if (err) {
        setError(err.message ?? "Couldn't resolve this request. Try again.");
        return;
      }
      setResolvingId(null);
      onResolved?.(RESOLVED_OUTCOMES.find((o) => o.id === outcome)!.label);
      void queryClient.invalidateQueries({ queryKey: queryKeys.business.myRequests() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.business.opportunities() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.intentcasts.feedQueries() });
      void queryClient.invalidateQueries({ queryKey: ["home", "opportunity-rail"] });
    } catch {
      setError("Couldn't resolve this request. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <HubSideCard id="business-requests-title" title="Your requests" icon="referral">
      {error ? (
        <p className="hub-card__note business-requests__error" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="hub-card__list">
        {requests.map((p) => {
          const row = mapIntentcastToRow(p, { includeGuidancePosts: true });
          const title = row?.roleHeader ?? p.content.split("\n")[0]!.slice(0, 120);
          const choosing = resolvingId === p.id;
          const legendId = `${baseId}-${p.id}-legend`;
          return (
            <li key={p.id} className="business-requests__item">
              <div className="business-requests__row">
                <span className="hub-card__item-main">
                  <span className="hub-card__item-title">{title}</span>
                  <span className="hub-card__meta">
                    {requestStep(p)} · Posted {formatRelativeTime(p.createdAt)}
                  </span>
                </span>
                {!choosing ? (
                  <button
                    type="button"
                    className="hub-card__pill business-requests__resolve"
                    onClick={() => {
                      setError(null);
                      setResolvingId(p.id);
                    }}
                  >
                    Resolve
                  </button>
                ) : null}
              </div>
              {choosing ? (
                <div className="business-requests__choices" role="group" aria-labelledby={legendId}>
                  <p id={legendId} className="hub-card__note">
                    How did it end?
                  </p>
                  <div className="business-requests__options">
                    {RESOLVED_OUTCOMES.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className="hub-card__pill"
                        disabled={busy}
                        onClick={() => void resolve(p.id, o.id)}
                      >
                        {o.label}
                      </button>
                    ))}
                    <button type="button" className="hub-card__more" disabled={busy} onClick={() => setResolvingId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </HubSideCard>
  );
}
