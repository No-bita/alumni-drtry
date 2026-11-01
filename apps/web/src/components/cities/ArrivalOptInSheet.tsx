import { useEffect, useState } from "react";
import { trackBetaUsageEvent } from "../../lib/betaAnalytics";
import { useQueryClient } from "@tanstack/react-query";
import { CITIES_KEY, optInArrival } from "../../lib/cities";
import { CitySheet } from "./CitySheet";

function CheckIcon() {
  return (
    <svg className="cities__tick-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Screen 5: after a city change into a v1 city. "Yes" creates the arrival; "Not now" creates nothing
 * (the Cities page then offers "Just moved? Show me as new in town" for 30 days).
 */
export function ArrivalOptInSheet({
  placeId,
  cityName,
  onClose,
  onDone,
}: {
  placeId: string;
  cityName: string;
  onClose: () => void;
  /** After a successful opt-in. */
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    trackBetaUsageEvent("cities_arrival_prompt_shown");
  }, [placeId]);

  const yes = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await optInArrival(placeId);
    setBusy(false);
    if (res.error) {
      setError(
        res.error.code === "ARRIVAL_NOT_ELIGIBLE"
          ? `You can show as new in ${cityName} only within 30 days of moving there.`
          : res.error.code === "DEMO_READ_ONLY"
            ? "Demo accounts can’t do this."
            : "Couldn’t save. Try again.",
      );
      return;
    }
    void queryClient.invalidateQueries({ queryKey: CITIES_KEY });
    onDone?.();
    onClose();
  };

  return (
    <CitySheet eyebrow="City updated" title={`New in ${cityName}?`} displayTitle busy={busy} onClose={onClose}>
      <div className="cities-sheet__body">
        <p className="cities__lede">
          Let {cityName} alumni know you’ve just arrived. Those who can help will offer, and you choose who to write to.
        </p>
        <ul className="cities__ticks">
          <li>
            <CheckIcon />
            You’ll appear under “New in {cityName}” for 30 days
          </li>
          <li>
            <CheckIcon />
            You’ll see each offer as it arrives
          </li>
          <li>
            <CheckIcon />
            Nobody can message you from it. You decide who to contact
          </li>
          <li>
            <CheckIcon />
            You can stop anytime from the Cities page
          </li>
        </ul>
        {error ? (
          <p className="cities__error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="button" className="cities__primary" disabled={busy} onClick={() => void yes()}>
          {busy ? "Saving…" : "Yes, show me as new in town"}
        </button>
        <button type="button" className="cities__textbtn cities__textbtn--center" disabled={busy} onClick={onClose}>
          Not now
        </button>
      </div>
    </CitySheet>
  );
}
