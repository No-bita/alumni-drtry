import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import "../styles/cities.css";
import { Nav } from "../components/Nav";
import { PostBulletinFlow, type PostBulletinFlowHandle } from "../components/PostBulletinFlow";
import { ArrivalOptInSheet } from "../components/cities/ArrivalOptInSheet";
import { CityHome } from "../components/cities/CityHome";
import { CitySwitcherSheet } from "../components/cities/CitySwitcherSheet";
import { NoCityPrompt, SavedCityCard } from "../components/cities/NoCityPrompt";
import { useAuth } from "../contexts/AuthContext";
import {
  CITIES_KEY,
  citiesKeys,
  fetchCities,
  fetchCity,
  findCityBySlug,
  type ArrivalPrompt,
  type CitiesList,
} from "../lib/cities";
import { queryKeys } from "../lib/queryKeys";
import { trackBetaUsageEvent } from "../lib/betaAnalytics";
import { SENT_NOTES_QUERY_KEY } from "../lib/sentNotes";
import { browsingLimitFromError } from "../lib/browsingLimits";

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
  const flowRef = useRef<PostBulletinFlowHandle>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [optIn, setOptIn] = useState<ArrivalPrompt | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // No linked city: correcting a saved entry, and whether that entry was saved just now (this visit).
  const [editingCity, setEditingCity] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const signedIn = auth.status === "authenticated";

  const list = useQuery({ queryKey: citiesKeys.list(), queryFn: ({ signal }) => fetchCities(signal), enabled: signedIn });
  const target = citySlug ? findCityBySlug(list.data, citySlug) : (list.data?.viewerCity ?? null);
  const placeId = target?.placeId ?? null;
  const city = useQuery({
    queryKey: citiesKeys.city(placeId ?? "none"),
    queryFn: ({ signal }) => fetchCity(placeId!, signal),
    enabled: signedIn && placeId !== null,
  });

  // One "viewed" event per city opened.
  const viewedRole = city.data?.viewerRole ?? null;
  useEffect(() => {
    if (!placeId || !viewedRole) return;
    trackBetaUsageEvent("cities_viewed", { role: viewedRole });
  }, [placeId, viewedRole]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: CITIES_KEY });
    void queryClient.invalidateQueries({ queryKey: SENT_NOTES_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.contactRequests.all });
  }, [queryClient]);

  if (!signedIn) return null;

  const displayName = auth.myProfile?.fullName?.trim() || undefined;
  const profileId = auth.myProfile?.id ?? null;
  const openWall = (options: { headline?: string; body?: string; placeId?: string | null }) =>
    flowRef.current?.open({
      category: "relocation",
      headline: options.headline,
      body: options.body,
      ...(options.placeId ? { placeId: options.placeId } : {}),
    });

  const data = city.data;
  const ToolbarTitle = data?.viewerRole === "arriver" && data.counts.alumni > 0 ? "div" : "h1";
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
        {browsingLimitFromError(list.error ?? city.error) ?? "Couldn’t load this city."}{" "}
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
    // Not linked to a city page. Saved text (from the server) shows as saved; the form is for a first entry
    // or a correction. A saved city waiting for review is linked, so it never lands here.
    const saved = list.data?.viewerResidence ?? null;
    const savedCity = saved?.city ?? null;
    body =
      saved && savedCity && !editingCity ? (
        <SavedCityCard
          saved={{ ...saved, city: savedCity }}
          justSaved={justSaved}
          cities={cities}
          onEdit={() => {
            setEditingCity(true);
            setJustSaved(false);
          }}
          onOpenAll={() => setSwitcherOpen(true)}
        />
      ) : (
        <NoCityPrompt
          key={saved ? `${saved.city}|${saved.country ?? ""}` : "none"}
          cities={cities}
          saved={saved}
          onOpenAll={() => setSwitcherOpen(true)}
          onCancel={savedCity ? () => setEditingCity(false) : undefined}
          onSaved={(prompt) => {
            setEditingCity(false);
            const now = queryClient.getQueryData<CitiesList>(citiesKeys.list());
            if (now?.viewerCity) setNotice("Saved to your profile.");
            else setJustSaved(true);
            if (prompt) setOptIn(prompt);
          }}
        />
      );
  } else if (!target || !data) {
    body = (
      <section className="cities__section">
        <h2 className="cities__h2">We don’t have that city yet</h2>
        <p className="cities__note">No alumni have it on their profile yet.</p>
        <button type="button" className="cities__secondary" onClick={() => setSwitcherOpen(true)}>
          All cities
        </button>
      </section>
    );
  } else {
    body = (
      <CityHome
        key={data.place.placeId}
        data={data}
        profileId={profileId}
        onChanged={refresh}
        onOptIn={() => setOptIn({ placeId: data.place.placeId, cityName: data.place.city })}
        onAsk={(starter) => openWall({ ...starter, placeId: data.place.placeId })}
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
            <ToolbarTitle className="nav-app-toolbar__welcome-title cities-toolbar-title">
              <button type="button" className="cities-toolbar-picker" aria-label={`Change city: ${toolbarCity}`} aria-haspopup="dialog" aria-expanded={switcherOpen} title={toolbarCity} onClick={() => setSwitcherOpen(true)}>
                <span>{toolbarCity}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </button>
            </ToolbarTitle>
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
        {data?.review ? (
          <div className={`cities__review cities__review--${data.review.status}`} role="status">
            <p className="cities__review-title">{data.review.message}</p>
            {data.review.rejectionReason ? <p className="cities__review-reason">Reason: {data.review.rejectionReason}</p> : null}
            {data.review.status === "rejected" ? (
              <p className="cities__review-reason">
                You can <Link to={profileId ? `/profiles/${profileId}?edit=city` : "/onboarding"}>change your city</Link> on your profile.
              </p>
            ) : null}
          </div>
        ) : null}
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
