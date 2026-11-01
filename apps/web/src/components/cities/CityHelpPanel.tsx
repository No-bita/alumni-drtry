import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { AUTH_SESSION_QUERY_KEY } from "../../lib/authSessionQuery";
import { trackBetaUsageEvent } from "../../lib/betaAnalytics";
import { CITIES_KEY, openToCapPath, type CityPayload } from "../../lib/cities";
import {
  OPEN_TO_MAX_SELECTED,
  createEmptyOpenToPreferences,
  normalizeOpenToPreferences,
  parseOpenToPreferences,
  toggleOpenToSelection,
} from "../../lib/openToPreferences";

/** Screen 1 §4: "You can help" — demand from other cities, notes waiting, and the city-help switch. */
export function CityHelpPanel({ city, panel }: { city: string; panel: NonNullable<CityPayload["helpPanel"]> }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [on, setOn] = useState(panel.cityHelpOn);
  const [serverOn, setServerOn] = useState(panel.cityHelpOn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profileId = auth.status === "authenticated" ? (auth.myProfile?.id ?? null) : null;

  if (serverOn !== panel.cityHelpOn && !busy) {
    // Follow a new server value, not an old prop that trails an optimistic save.
    setServerOn(panel.cityHelpOn);
    setOn(panel.cityHelpOn);
  }

  const toggle = async () => {
    if (busy || auth.status !== "authenticated") return;
    const current = parseOpenToPreferences(auth.myProfile?.openToPreferences) ?? createEmptyOpenToPreferences();
    const turningOn = !current.selected.includes("city_help");
    if (turningOn && current.selected.length >= OPEN_TO_MAX_SELECTED) {
      if (profileId) navigate(openToCapPath(profileId));
      return;
    }
    const next = toggleOpenToSelection(current, "city_help");
    setBusy(true);
    setError(null);
    setOn(turningOn);
    const res = await api.patch("/v1/me/profile", {
      openToPreferences: next.selected.length > 0 ? normalizeOpenToPreferences(next) : null,
    });
    setBusy(false);
    if (res.error) {
      setOn(!turningOn);
      setError(res.error.code === "DEMO_READ_ONLY" ? "Demo accounts can’t change this." : "Couldn’t save. Try again.");
      return;
    }
    if (turningOn) trackBetaUsageEvent("cities_city_help_on", { surface: "panel" });
    void queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: CITIES_KEY });
  };

  return (
    <section className="cities__section cities__panel" aria-labelledby="cities-help-title">
      <div className="cities__head">
        <h2 id="cities-help-title" className="cities__h2">
          You can help
        </h2>
        <p className="cities__note">Help alumni settle in {city}</p>
      </div>
      {panel.askCount30d !== null ? (
        <p className="cities__stat">
          <span className="cities__stat-num">{panel.askCount30d}</span>
          <span>
            moving-help {panel.askCount30d === 1 ? "search" : "searches"} for {city} in the last 30 days
          </span>
        </p>
      ) : null}
      {panel.pendingNotesForMe > 0 ? (
        <Link to="/notifications" className="cities__row cities__row--card">
          <span>
            {panel.pendingNotesForMe} {panel.pendingNotesForMe === 1 ? "note" : "notes"} waiting for you
          </span>
          <span aria-hidden>›</span>
        </Link>
      ) : null}
      <div className="cities__row cities__row--card cities__switch-row">
        <span className="cities__switch-copy">
          <span className="cities__switch-title" id="cities-help-switch-label">
            Open to city help
          </span>
          <span className="cities__meta">People moving here see you first</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="cities-help-switch-label"
          className={`cities__switch${on ? " cities__switch--on" : ""}`}
          disabled={busy}
          onClick={() => void toggle()}
        >
          <span className="cities__switch-knob" aria-hidden />
        </button>
      </div>
      {!on && panel.openToCount >= OPEN_TO_MAX_SELECTED ? (
        <p className="cities__note">
          You’re open to {OPEN_TO_MAX_SELECTED} things already. Turning this on opens your profile so you can swap one out.
        </p>
      ) : null}
      {error ? (
        <p className="cities__error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
