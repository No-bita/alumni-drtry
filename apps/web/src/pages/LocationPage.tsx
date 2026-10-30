import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import "../styles/cities.css";
import { Nav } from "../components/Nav";
import { PostBulletinFlow, type PostBulletinFlowHandle } from "../components/PostBulletinFlow";
import { ArrivalOptInSheet } from "../components/cities/ArrivalOptInSheet";
import { ArriverView } from "../components/cities/ArriverView";
import { CityAlumniList } from "../components/cities/CityAlumniList";
import { CityEmailsControl } from "../components/cities/CityEmailsControl";
import { CityHelpPanel } from "../components/cities/CityHelpPanel";
import { CityMeetups } from "../components/cities/CityMeetups";
import { CitySwitcherSheet } from "../components/cities/CitySwitcherSheet";
import { NewInCitySection } from "../components/cities/NewInCitySection";
import { NewcomerOffersSection } from "../components/cities/NewcomerOffersSection";
import { NoCityPrompt } from "../components/cities/NoCityPrompt";
import { useAuth } from "../contexts/AuthContext";
import {
  CITIES_KEY,
  citiesKeys,
  endArrival,
  fetchCities,
  fetchCity,
  findCityBySlug,
  type ArrivalPrompt,
  type CityAskMode,
  type CityPayload,
} from "../lib/cities";
import { queryKeys } from "../lib/queryKeys";
import { trackBetaUsageEvent } from "../lib/betaAnalytics";
import { SENT_NOTES_QUERY_KEY } from "../lib/sentNotes";

/**
 * Cities (/intent/location and /intent/location/:citySlug). Built around the settled local: what changed in
 * your city since last time (people arriving), and who you can help. Supports the arriver (lives elsewhere),
 * the newcomer (just arrived and opted in) and someone with no city yet. Nothing here is sample data.
 * Reach-out rule (SPEC §2): a note only to someone who said yes to that kind of contact, with a reason.
 */
export function LocationPage() {
  const { citySlug } = useParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const flowRef = useRef<PostBulletinFlowHandle>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [optIn, setOptIn] = useState<ArrivalPrompt | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const signedIn = auth.status === "authenticated";

  const list = useQuery({ queryKey: citiesKeys.list(), queryFn: ({ signal }) => fetchCities(signal), enabled: signedIn });
  const target = citySlug ? findCityBySlug(list.data, citySlug) : (list.data?.viewerCity ?? null);
  const placeId = target?.placeId ?? null;
  const city = useQuery({
    queryKey: citiesKeys.city(placeId ?? "none"),
    queryFn: ({ signal }) => fetchCity(placeId!, signal),
    enabled: signedIn && placeId !== null,
  });

  // One "viewed" event per city opened (and whether the nudge email brought them), for the nudge funnel.
  const viewedRole = city.data?.viewerRole ?? null;
  const via = searchParams.get("via");
  useEffect(() => {
    if (!placeId || !viewedRole) return;
    trackBetaUsageEvent("cities_viewed", { role: viewedRole, ...(via === "nudge" ? { via: "nudge" } : {}) });
  }, [placeId, viewedRole, via]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: CITIES_KEY });
    void queryClient.invalidateQueries({ queryKey: SENT_NOTES_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.contactRequests.all });
  }, [queryClient]);

  if (!signedIn) return null;

  const displayName = auth.myProfile?.fullName?.trim() || undefined;
  const profileId = auth.myProfile?.id ?? null;
  const emailsOpen = searchParams.get("emails") === "manage";
  const closeEmails = () =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("emails");
        return next;
      },
      { replace: true },
    );

  const openWall = (options: { headline?: string; body?: string; placeId?: string | null }) =>
    flowRef.current?.open({
      category: "relocation",
      headline: options.headline,
      body: options.body,
      ...(options.placeId ? { placeId: options.placeId } : {}),
    });

  const data = city.data;
  const toolbarCity = data?.place.city ?? target?.city ?? "Cities";
  const cities = list.data?.cities ?? [];
  let body: React.ReactNode;

  if (list.isPending || (placeId !== null && city.isPending)) {
    body = (
      <p className="cities__note" role="status">
        Loading…
      </p>
    );
  } else if (list.isError || city.isError) {
    body = (
      <p className="cities__note" role="alert">
        Couldn’t load this city.{" "}
        <button
          type="button"
          className="cities__textbtn"
          onClick={() => {
            void list.refetch();
            if (placeId) void city.refetch();
          }}
        >
          Try again
        </button>
      </p>
    );
  } else if (!citySlug && !list.data?.viewerCity) {
    body = (
      <NoCityPrompt
        cities={cities}
        onOpenAll={() => setSwitcherOpen(true)}
        onSaved={(_place, prompt) => {
          if (prompt) setOptIn(prompt);
        }}
      />
    );
  } else if (!target || !data) {
    body = (
      <section className="cities__section">
        <h2 className="cities__h2">We don’t have that city yet</h2>
        <p className="cities__note">No alumni have it on their profile. Pick a city from the list.</p>
        <button type="button" className="cities__secondary" onClick={() => setSwitcherOpen(true)}>
          All cities
        </button>
      </section>
    );
  } else if (data.viewerRole === "arriver" || data.viewerRole === "no_city") {
    body = (
      <ArriverView
        data={data}
        onChanged={refresh}
        onAskWall={(mode: CityAskMode) =>
          openWall({ headline: `${mode === "moving" ? "Moving to" : "Visiting"} ${data.place.city}`, placeId: data.place.placeId })
        }
      />
    );
  } else {
    body = (
      <ResidentView
        data={data}
        profileId={profileId}
        onChanged={refresh}
        onOptIn={() => setOptIn({ placeId: data.place.placeId, cityName: data.place.city })}
        onSwitch={() => setSwitcherOpen(true)}
        onPostMeetup={() => openWall({ placeId: data.place.placeId })}
        onNotice={setNotice}
      />
    );
  }

  return (
    <div className="intent-page-shell cities-page-shell">
      <Nav
        variant="home"
        avatarName={displayName}
        appToolbarLead={
          <div className="nav-app-toolbar__welcome">
            <h1 className="nav-app-toolbar__welcome-title cities-toolbar-title">
              <button type="button" className="cities-toolbar-picker" aria-label={`Change city: ${toolbarCity}`} aria-haspopup="dialog" aria-expanded={switcherOpen} title={toolbarCity} onClick={() => setSwitcherOpen(true)}>
                <span>{toolbarCity}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </button>
            </h1>
          </div>
        }
      />
      <main className="cities">
        {notice ? (
          <div className="cities__notice" role="status">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </div>
        ) : null}
        {emailsOpen ? <CityEmailsControl current={data?.nudgeFrequency ?? "weekly"} onClose={closeEmails} /> : null}
        {body}
      </main>

      {switcherOpen ? (
        <CitySwitcherSheet
          cities={cities}
          viewerCity={list.data?.viewerCity ?? null}
          currentPlaceId={placeId}
          onClose={() => setSwitcherOpen(false)}
        />
      ) : null}
      {optIn ? (
        <ArrivalOptInSheet
          placeId={optIn.placeId}
          cityName={optIn.cityName}
          onClose={() => setOptIn(null)}
          onDone={() => setNotice(`You’re shown as new in ${optIn.cityName} for 30 days.`)}
        />
      ) : null}
      <PostBulletinFlow
        ref={flowRef}
        onPublishSuccess={() => {
          setNotice("Posted. It’s on the Wall and under Get together.");
          refresh();
        }}
      />
    </div>
  );
}

/** Local (screen 1) and newcomer (screen 6) views: the viewer lives here. */
function ResidentView({
  data,
  profileId,
  onChanged,
  onOptIn,
  onSwitch,
  onPostMeetup,
  onNotice,
}: {
  data: CityPayload;
  profileId: string | null;
  onChanged: () => void;
  onOptIn: () => void;
  onSwitch: () => void;
  onPostMeetup: () => void;
  onNotice: (text: string) => void;
}) {
  const [stopping, setStopping] = useState(false);
  const city = data.place.city;
  const newcomer = data.viewerRole === "newcomer" && data.myArrival !== null;

  const stop = async () => {
    if (stopping) return;
    setStopping(true);
    const res = await endArrival();
    setStopping(false);
    if (res.error) {
      onNotice("Couldn’t update. Try again.");
      return;
    }
    onNotice("You’re no longer shown as new. Offers you already have stay here.");
    onChanged();
  };

  return (
    <>
      <header className="cities__header">
        <p className="cities__eyebrow">{newcomer ? "Your city · new in town" : "Your city"}</p>
        {newcomer ? (
          <p className="cities__count">
            Shown as new to local alumni for {data.myArrival!.daysLeft} more {data.myArrival!.daysLeft === 1 ? "day" : "days"}
          </p>
        ) : (
          <p className="cities__count">
            {data.counts.alumni} {data.counts.alumni === 1 ? "alum lives" : "alumni live"} here
          </p>
        )}
        {newcomer ? (
          <button type="button" className="cities__textbtn" disabled={stopping} onClick={() => void stop()}>
            Stop showing me as new
          </button>
        ) : (
          <>
            {data.arrivalPrompt ? (
              <button type="button" className="cities__textbtn" onClick={onOptIn}>
                Just moved? Show me as new in town
              </button>
            ) : null}
            {profileId ? (
              <Link to={`/profiles/${profileId}?edit=city`} className="cities__link">
                Moved away? Update your city
              </Link>
            ) : null}
          </>
        )}
      </header>

      {/* Offers stay visible to the newcomer after "Stop showing me as new" (until their 30 days end). */}
      {newcomer || data.offers.length > 0 ? (
        <NewcomerOffersSection offers={data.offers} previousCity={data.myArrival?.previousCity ?? null} onChanged={onChanged} />
      ) : null}

      {!newcomer && data.v1Enabled && data.arrivals && data.arrivals.items.length > 0 ? (
        <NewInCitySection city={city} arrivals={data.arrivals.items} total={data.arrivals.total} onChanged={onChanged} />
      ) : null}

      {data.v1Enabled && data.helpPanel ? <CityHelpPanel city={city} panel={data.helpPanel} /> : null}

      {data.alumni ? <CityAlumniList place={data.place} initial={data.alumni} totalAlumni={data.counts.alumni} onChanged={onChanged} /> : null}

      {data.v1Enabled ? (
        <CityMeetups city={city} posts={data.posts} chapterLink={data.chapterLink} onPost={onPostMeetup} onChanged={onChanged} />
      ) : null}

      {data.v1Enabled ? (
        <section className="cities__section" aria-labelledby="cities-else-title">
          <h2 id="cities-else-title" className="cities__h2">
            Something else?
          </h2>
          <ul className="cities__rows">
            <li>
              <button type="button" className="cities__row cities__row--button" onClick={onSwitch}>
                <span className="cities__row-title">Moving to another city?</span>
                <span aria-hidden>›</span>
              </button>
            </li>
            <li>
              <Link to="/match?cat=higher_studies" className="cities__row">
                <span className="cities__row-title">Studying abroad? Ask alumni</span>
                <span aria-hidden>›</span>
              </Link>
            </li>
          </ul>
        </section>
      ) : null}
    </>
  );
}
