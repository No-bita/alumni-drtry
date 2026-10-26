import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { normalizeCityIntentSlug } from "../lib/cityIntentFromToolbar";
import { checklistSteps, doneCount, isNewEnough, readFlag, writeFlag } from "../lib/onboardingChecklist";
import "../styles/onboarding-checklist.css";

/** Steps shown while messaging is paused (the "send your first message" step stays off). */
const STEP_COUNT = 2;

/**
 * First-two-weeks nudge as one line under the ask: only the next undone step, dismissible.
 * Ticks itself off from real data (batch + city) and from opening the city board.
 */
export function OnboardingChecklistCard() {
  const auth = useAuth();
  const personId = auth.status === "authenticated" ? auth.person.personId : null;
  const profile = auth.status === "authenticated" ? auth.myProfile : null;

  const [dismissed, setDismissed] = useState(() => (personId ? readFlag(personId, "dismissed") : false));
  const [cityVisited, setCityVisited] = useState(() => (personId ? readFlag(personId, "city") : false));
  const [now] = useState(() => Date.now());

  if (!personId || !profile || dismissed) return null;
  if (!isNewEnough(profile.createdAt, now)) return null;

  const steps = checklistSteps({ profile, hasThreads: false, cityVisited });
  const left = STEP_COUNT - doneCount({ profile: steps.profile, city: steps.city, message: false });
  if (left <= 0) return null;

  const lead = left === 1 ? "One step left:" : "Next step:";
  const citySlug = profile.residenceCity?.trim() ? normalizeCityIntentSlug(profile.residenceCity) : "";

  const next = !steps.profile
    ? {
        text: "add your batch and city",
        why: " so alumni can find you.",
        cta: "Add them",
        to: `/profiles/${personId}`,
        onClick: undefined,
      }
    : {
        text: "join your city board",
        why: " to see who is nearby and what they are asking for.",
        cta: "Open city board",
        to: citySlug ? `/intent/location/${citySlug}` : "/intent/location",
        onClick: () => {
          writeFlag(personId, "city");
          setCityVisited(true);
        },
      };

  return (
    <section className="onboarding-checklist onboarding-checklist--line" aria-label="Getting started">
      <p className="onboarding-checklist__line">
        {lead} <strong>{next.text}</strong>
        {next.why}
      </p>
      <Link to={next.to} className="onboarding-checklist__cta" onClick={next.onClick}>
        {next.cta}
      </Link>
      <button
        type="button"
        className="onboarding-checklist__dismiss"
        aria-label="Dismiss the getting started card"
        onClick={() => {
          writeFlag(personId, "dismissed");
          setDismissed(true);
        }}
      >
        ×
      </button>
    </section>
  );
}
