import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { assertApiGet } from "../lib/assertApiGet";
import { queryKeys } from "../lib/queryKeys";
import { normalizeCityIntentSlug } from "../lib/cityIntentFromToolbar";
import type { ConnectionThreadsListResponse } from "../api/client";
import {
  checklistSteps,
  doneCount,
  isNewEnough,
  readFlag,
  writeFlag,
  type ChecklistStepId,
} from "../lib/onboardingChecklist";
import "../styles/onboarding-checklist.css";

/** Small first-week card: three steps, deep links, ticks itself off. No tooltip tour. */
export function OnboardingChecklistCard() {
  const auth = useAuth();
  const personId = auth.status === "authenticated" ? auth.person.personId : null;
  const profile = auth.status === "authenticated" ? auth.myProfile : null;

  const threadsQuery = useQuery({
    queryKey: [...queryKeys.connectionThreads.list(), personId],
    queryFn: ({ signal }) => assertApiGet<ConnectionThreadsListResponse>("/v1/connection-threads", signal),
    enabled: Boolean(personId),
  });

  const [dismissed, setDismissed] = useState(() => (personId ? readFlag(personId, "dismissed") : false));
  const [cityVisited, setCityVisited] = useState(() => (personId ? readFlag(personId, "city") : false));
  // First time it shows, it opens up. After that it sits there as a slim card.
  const [open, setOpen] = useState(() => (personId ? !readFlag(personId, "seen") : false));
  const [now] = useState(() => Date.now());

  // Only count the card as seen once it can actually be on screen.
  const readyToShow = Boolean(personId && profile && !dismissed && isNewEnough(profile.createdAt, now) && !threadsQuery.isPending);

  useEffect(() => {
    if (personId && open && readyToShow) writeFlag(personId, "seen");
  }, [personId, open, readyToShow]);

  if (!personId || !profile || dismissed) return null;
  if (!isNewEnough(profile.createdAt, now)) return null;
  if (threadsQuery.isPending) return null;

  const steps = checklistSteps({
    profile,
    hasThreads: (threadsQuery.data?.threads?.length ?? 0) > 0,
    cityVisited,
  });
  const done = doneCount(steps);
  if (done === 3) return null;

  const citySlug = profile.residenceCity?.trim() ? normalizeCityIntentSlug(profile.residenceCity) : "";
  const rows: Array<{ id: ChecklistStepId; title: string; hint: string; to: string }> = [
    { id: "profile", title: "Complete your profile", hint: "Batch and current city, so people can actually find you.", to: `/profiles/${personId}` },
    { id: "city", title: "Join your city board", hint: "See who is nearby and what they are asking for.", to: citySlug ? `/intent/location/${citySlug}` : "/intent/location" },
    { id: "message", title: "Send your first message", hint: "Say hi to someone. We promise it is less weird than it sounds.", to: "/search" },
  ];

  return (
    <section className="onboarding-checklist" aria-labelledby="onboarding-checklist-title">
      <header className="onboarding-checklist__head">
        <button
          type="button"
          className="onboarding-checklist__toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span id="onboarding-checklist-title" className="onboarding-checklist__title">
            {open ? "Three quick things and you're officially a regular" : `Getting started: ${done} of 3 done`}
          </span>
        </button>
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
      </header>
      {open ? (
        <ol className="onboarding-checklist__list">
          {rows.map((row) => (
            <li key={row.id} className={`onboarding-checklist__item${steps[row.id] ? " is-done" : ""}`}>
              <span className="onboarding-checklist__tick" aria-hidden>{steps[row.id] ? "✓" : ""}</span>
              <Link
                to={row.to}
                className="onboarding-checklist__link"
                onClick={() => {
                  if (row.id === "city") {
                    writeFlag(personId, "city");
                    setCityVisited(true);
                  }
                }}
              >
                <span className="onboarding-checklist__item-title">{row.title}</span>
                <span className="onboarding-checklist__item-hint">{steps[row.id] ? "Done. Look at you go." : row.hint}</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
