import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrivalOptInSheet } from "../components/cities/ArrivalOptInSheet";
import { trackBetaUsageEvent } from "../lib/betaAnalytics";
import type { ArrivalPrompt } from "../lib/cities";
import { Nav } from "../components/Nav";
import { ProfilePageView } from "../components/profile/ProfilePageView";
import { HeaderSheet } from "../components/profile/HeaderSheet";
import { AreasSheet } from "../components/profile/AreasSheet";
import { OpenToSheet } from "../components/profile/OpenToSheet";
import { EntriesSheet } from "../components/profile/EntriesSheet";
import { LinksSheet } from "../components/profile/LinksSheet";
import { ContactSheet } from "../components/profile/ContactSheet";
import { MatchReachOutDialog } from "../components/MatchReachOutDialog";
import { WhatsAppNotesSettings } from "../components/WhatsAppNotesSettings";
import { PageStateBlock } from "../components/PageStateBlock";
import type { MeLinksResponse, ProfileResponse } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { assertApiGet } from "../lib/assertApiGet";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";
import { queryKeys } from "../lib/queryKeys";
import { parseOpenToPreferences } from "../lib/openToPreferences";
import { browsingLimitFromError } from "../lib/browsingLimits";
import { headlineInstituteLine, headlineRole, instituteEducation, type ProfileSection } from "../lib/profilePage";

/** Deep links from other pages: ?edit=contact | open-to | city opens that section's sheet. */
const EDIT_PARAM_SECTIONS: Record<string, ProfileSection> = { contact: "contact", "open-to": "openTo", city: "header" };

export function Profile() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const navigate = useNavigate();

  const [section, setSection] = useState<ProfileSection | null>(null);
  const [reachingOut, setReachingOut] = useState(false);
  /** Cities: after a city change into a v1 city, offer "New in [city]?" (screen 5). */
  const [arrivalPrompt, setArrivalPrompt] = useState<ArrivalPrompt | null>(null);
  /** Cities' "Moved away? Update your city" opened the sheet (for the city-update count). */
  const [fromCities, setFromCities] = useState(false);
  /** Cities sent the member here at the 5-tag cap to make room for city help. */
  const [openToNotice, setOpenToNotice] = useState<string | null>(null);

  const isOwnProfile = auth.status === "authenticated" && auth.myProfile?.id != null && auth.myProfile.id === id;

  const profileQuery = useQuery({
    queryKey: queryKeys.profiles.detail(id ?? ""),
    queryFn: ({ signal }) => assertApiGet<ProfileResponse>(`/v1/profiles/${id}`, signal),
    enabled: Boolean(id),
  });
  const data = profileQuery.data ?? null;
  const loading = profileQuery.isPending;

  // The owner's own links include any the public profile hides; the Links sheet edits these.
  const linksQuery = useQuery({
    queryKey: queryKeys.me.links(),
    queryFn: ({ signal }) => assertApiGet<MeLinksResponse>("/v1/me/links", signal),
    enabled: Boolean(isOwnProfile),
  });

  // Own profile only: companies on their job entries that review rejected, so they can fix them.
  const rejectedOrgsQuery = useQuery({
    queryKey: ["me", "rejected-organizations"],
    queryFn: ({ signal }) =>
      assertApiGet<{ organizations: { id: string; name: string; rejectionReason: string | null }[] }>(
        "/v1/me/rejected-organizations",
        signal,
      ),
    enabled: Boolean(isOwnProfile),
  });
  const rejectedOrgs = rejectedOrgsQuery.data?.organizations ?? [];

  const refresh = useCallback(async () => {
    if (id) await queryClient.invalidateQueries({ queryKey: queryKeys.profiles.detail(id) });
  }, [id, queryClient]);

  const closeSheet = useCallback(() => {
    setSection(null);
    setOpenToNotice(null);
    setFromCities(false);
  }, []);

  const savedAndClose = useCallback(async () => {
    await refresh();
    closeSheet();
  }, [refresh, closeSheet]);

  // ?edit=… from Careers ("Offer help"), Cities ("Moved away?", the 5-tag cap) and others.
  useEffect(() => {
    const editMode = searchParams.get("edit");
    const target = editMode ? EDIT_PARAM_SECTIONS[editMode] : undefined;
    if (!isOwnProfile || !target || !data) return;
    const capReason = searchParams.get("limit") === "city_help";
    const t = window.setTimeout(() => {
      if (target === "openTo" && capReason) {
        setOpenToNotice("You can be open to 5 things at once. Turn one off to make room for city help, then save.");
      }
      if (target === "header") setFromCities(true);
      setSection(target);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("edit");
          next.delete("limit");
          return next;
        },
        { replace: true },
      );
    }, 0);
    return () => window.clearTimeout(t);
  }, [searchParams, isOwnProfile, data, setSearchParams]);

  const navAvatarName =
    auth.status === "authenticated" ? displayFirstNameFromEmail(auth.person.institutionalEmail) : undefined;

  const profileLimit = browsingLimitFromError(profileQuery.error);
  if (profileLimit) {
    return (
      <>
        <Nav variant="home" avatarName={navAvatarName} />
        <div className="home-dashboard profile-page">
          <div className="profile-page__loading">
            <PageStateBlock title="Browsing paused" description={profileLimit} tone="error" />
          </div>
        </div>
      </>
    );
  }

  if (profileQuery.isError || (!loading && !data)) {
    return (
      <>
        <Nav variant="home" avatarName={navAvatarName} />
        <div className="home-dashboard profile-page">
          <div className="profile-page__loading">
            <PageStateBlock
              title="Profile not found"
              description={
                <Link to="/search" className="home-dashboard__text-link home-dashboard__text-link--caps profile-page__back-link">
                  Back to directory
                </Link>
              }
              tone="error"
            />
          </div>
        </div>
      </>
    );
  }

  if (loading || !data) {
    return (
      <>
        <Nav variant="home" avatarName={navAvatarName} />
        <div className="home-dashboard profile-page">
          <div className="pp pp--loading" aria-busy="true" aria-label="Loading profile">
            <div className="pp-skel pp-skel--head" />
            <div className="pp-skel-row">
              <div className="pp-skel" />
              <div className="pp-skel" />
              <div className="pp-skel" />
            </div>
          </div>
        </div>
      </>
    );
  }

  const profile = data.profile;
  const occupations = data.occupations ?? [];
  const areas = data.areas ?? [];
  const openTo = parseOpenToPreferences(profile.openToPreferences) ?? null;
  const me = auth.status === "authenticated" ? auth.myProfile : null;
  const onboardingIncomplete = isOwnProfile && !me?.onboardingCompletedAt;
  const current = headlineRole(occupations);

  const ownerNotice =
    isOwnProfile && rejectedOrgs.length > 0 ? (
      <div className="pp-notice" role="status">
        <h3 className="pp-notice__title">Company needs updating</h3>
        {rejectedOrgs.map((org) => (
          <p key={org.id} className="pp-notice__text">
            &lsquo;{org.name}&rsquo; wasn&rsquo;t accepted as a company.
            {org.rejectionReason ? ` Reason: ${org.rejectionReason.replace(/[.\s]+$/, "")}.` : ""} Please update the company on your profile.
          </p>
        ))}
        <button type="button" className="pp-inline-link" onClick={() => setSection("career")}>
          Update company
        </button>
      </div>
    ) : null;

  const institute = instituteEducation(profile, true);
  const instituteLockedLine = [institute?.institution, institute?.program, institute?.years].filter(Boolean).join(" · ") || headlineInstituteLine(profile);

  return (
    <>
      <Nav variant="home" avatarName={navAvatarName} />
      <div className="home-dashboard profile-page profile-page--one">
        <ProfilePageView
          profile={profile}
          occupations={occupations}
          links={data.links ?? []}
          areas={areas}
          openTo={openTo}
          yourNote={data.yourNote ?? null}
          isOwnProfile={isOwnProfile}
          onboardingIncomplete={onboardingIncomplete}
          privateContact={isOwnProfile ? (me ?? undefined) : undefined}
          ownerNotice={ownerNotice}
          ownerExtras={isOwnProfile ? <WhatsAppNotesSettings /> : null}
          onEdit={setSection}
          onReachOut={() => setReachingOut(true)}
          onSignOut={() => {
            void auth.logout().then(() => navigate("/signed-out", { replace: true }));
          }}
          onSignOutEverywhere={
            auth.status === "authenticated" && !auth.person.isDemo
              ? () => auth.logoutAll().then(() => navigate("/signed-out", { replace: true, state: { plain: true } }))
              : undefined
          }
        />
      </div>

      {isOwnProfile && section === "header" ? (
        <HeaderSheet
          city={profile.residenceCity}
          country={profile.residenceCountry}
          focusCity={fromCities}
          onClose={closeSheet}
          onSaved={({ arrivalPrompt: prompt, changedCity }) => {
            if (fromCities && changedCity) trackBetaUsageEvent("cities_city_updated");
            void auth.refetch();
            void savedAndClose();
            if (prompt) setArrivalPrompt(prompt);
          }}
        />
      ) : null}
      {isOwnProfile && section === "areas" ? <AreasSheet saved={areas} onClose={closeSheet} onSaved={() => void savedAndClose()} /> : null}
      {isOwnProfile && section === "openTo" ? (
        <OpenToSheet
          saved={openTo}
          notice={openToNotice}
          hasAreas={areas.length > 0}
          onAddAreas={() => setSection("areas")}
          onClose={closeSheet}
          onSaved={() => {
            void auth.refetch();
            void savedAndClose();
          }}
        />
      ) : null}
      {isOwnProfile && (section === "career" || section === "education") ? (
        <EntriesSheet
          kind={section}
          occupations={occupations}
          institute={
            section === "education"
              ? {
                  line: instituteLockedLine,
                  departmentOther:
                    profile.departmentCode === "other"
                      ? {
                          value: profile.departmentOtherText ?? "",
                          status: profile.departmentOtherStatus,
                          rejectionReason: profile.departmentOtherRejectionReason ?? null,
                        }
                      : null,
                }
              : undefined
          }
          onClose={closeSheet}
          onChanged={() => {
            void refresh();
            void queryClient.invalidateQueries({ queryKey: ["me", "rejected-organizations"] });
          }}
        />
      ) : null}
      {isOwnProfile && section === "links" ? (
        <LinksSheet
          links={linksQuery.data?.links ?? data.links ?? []}
          onClose={closeSheet}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.me.links() });
            void savedAndClose();
          }}
        />
      ) : null}
      {isOwnProfile && section === "contact" ? (
        <ContactSheet
          personalEmail={me?.personalEmail ?? null}
          mobilePhone={me?.mobilePhone ?? null}
          onClose={closeSheet}
          onSaved={() => {
            void auth.refetch();
            closeSheet();
          }}
        />
      ) : null}

      {reachingOut && !isOwnProfile ? (
        <MatchReachOutDialog
          recipient={{ id: profile.id, fullName: profile.fullName }}
          referral={{ company: current?.organizationName ?? null }}
          source="profile"
          onClose={() => {
            setReachingOut(false);
            void refresh();
          }}
        />
      ) : null}

      {arrivalPrompt ? (
        <ArrivalOptInSheet
          placeId={arrivalPrompt.placeId}
          cityName={arrivalPrompt.cityName}
          onClose={() => setArrivalPrompt(null)}
          onDone={() => navigate("/intent/location")}
        />
      ) : null}
    </>
  );
}
