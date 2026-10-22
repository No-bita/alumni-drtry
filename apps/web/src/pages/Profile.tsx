import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Nav } from "../components/Nav";
import { ProfileHero } from "../components/profile/ProfileHero";
import { ProfileAbout } from "../components/profile/ProfileAbout";
import { ProfileExperience } from "../components/profile/ProfileExperience";
import { ProfileEngagementCards } from "../components/profile/ProfileEngagementCards";
import { ProfileIitBhu } from "../components/profile/ProfileIitBhu";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { PageStateBlock } from "../components/PageStateBlock";
import {
  type AdminAllowedEmailsResponse,
  type AdminMetricsResponse,
  api,
  type MeLinksResponse,
  type ProfileLinkView,
  type ProfileResponse,
} from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { assertApiGet } from "../lib/assertApiGet";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";
import { queryKeys } from "../lib/queryKeys";
import { preflightProfileEdits } from "../lib/profileSavePreflight";
import {
  emptySocialLinkDraft,
  linkToSocialPlatformKey,
  otherProfileLinks,
  socialLinksDraftFromProfile,
  socialPlatformLabel,
  SOCIAL_PLATFORM_ORDER,
  type SocialPlatformKey,
  normalizeSocialUrl,
} from "../lib/socialLinks";
import {
  buildOccupationCreatePayload,
  buildOccupationPatchPayload,
  clearOrganizationIdCache,
  occupationsToDrafts,
  resolveOrganizationId,
  validateOccupationDraft,
  type OccupationDraft,
} from "../lib/occupationProfileEdit";
import {
  normalizeOpenToPreferences,
  openToPreferencesForEdit,
  parseOpenToPreferences,
  type OpenToPreferences,
} from "../lib/openToPreferences";

export function Profile() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const navigate = useNavigate();
  const refetchAuth = auth.refetch;

  const [isEditing, setIsEditing] = useState(false);
  const [draftPersonalEmail, setDraftPersonalEmail] = useState("");
  const [draftMobilePhone, setDraftMobilePhone] = useState("");
  const [draftResidenceCountry, setDraftResidenceCountry] = useState("");
  const [draftResidenceCity, setDraftResidenceCity] = useState("");
  const [draftOpenTo, setDraftOpenTo] = useState<OpenToPreferences>(() =>
    openToPreferencesForEdit(null),
  );
  const [draftOccupations, setDraftOccupations] = useState<OccupationDraft[]>([]);
  const [editLinks, setEditLinks] = useState<ProfileLinkView[]>([]);
  const [draftSocialLinks, setDraftSocialLinks] = useState(emptySocialLinkDraft);
  const [saving, setSaving] = useState(false);
  const [linksSaving, setLinksSaving] = useState(false);
  const [linkBusyId, setLinkBusyId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [linksError, setLinksError] = useState<string | null>(null);
  const [adminEmailDraft, setAdminEmailDraft] = useState("");
  const [adminAllowlistBusy, setAdminAllowlistBusy] = useState(false);
  const [adminAllowlistError, setAdminAllowlistError] = useState<string | null>(null);
  const editLinksHydratedRef = useRef(false);
  const [openSocialPlatform, setOpenSocialPlatform] = useState<SocialPlatformKey | null>(null);

  const isOwnProfile =
    auth.status === "authenticated" && auth.myProfile?.id != null && auth.myProfile.id === id;
  const isAdminViewer = auth.status === "authenticated" && auth.person.role !== "alumni";

  const profileQuery = useQuery({
    queryKey: queryKeys.profiles.detail(id ?? ""),
    queryFn: ({ signal }) => assertApiGet<ProfileResponse>(`/v1/profiles/${id}`, signal),
    enabled: Boolean(id),
  });

  const data = profileQuery.data ?? null;
  const loading = profileQuery.isPending;

  const linksQuery = useQuery({
    queryKey: queryKeys.me.links(),
    queryFn: ({ signal }) => assertApiGet<MeLinksResponse>("/v1/me/links", signal),
    enabled: Boolean(isOwnProfile),
  });

  const adminMetricsQuery = useQuery({
    queryKey: ["admin-metrics", "profile-dashboard"],
    queryFn: async () => {
      const { data, error } = await api.get<AdminMetricsResponse>("/v1/admin/metrics");
      if (error || !data) {
        throw new Error(error?.message ?? error?.code ?? "Could not load admin metrics.");
      }
      return data.metrics;
    },
    enabled: Boolean(isOwnProfile && isAdminViewer),
    staleTime: 60_000,
  });

  const adminAllowedEmailsQuery = useQuery({
    queryKey: ["admin-allowed-emails", "profile-dashboard"],
    queryFn: async () => {
      const { data, error } = await api.get<AdminAllowedEmailsResponse>("/v1/admin/allowed-admin-emails");
      if (error || !data) {
        throw new Error(error?.message ?? error?.code ?? "Could not load admin allowed emails.");
      }
      return data.emails;
    },
    enabled: Boolean(isOwnProfile && isAdminViewer),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!isEditing) {
      editLinksHydratedRef.current = false;
      return;
    }
    if (!linksQuery.data?.links || editLinksHydratedRef.current) return;
    editLinksHydratedRef.current = true;
    queueMicrotask(() => {
      const nextLinks = linksQuery.data!.links;
      setEditLinks(nextLinks);
      setDraftSocialLinks(socialLinksDraftFromProfile(nextLinks));
    });
  }, [isEditing, linksQuery.data]);

  const navAvatarName =
    auth.status === "authenticated"
      ? displayFirstNameFromEmail(auth.person.institutionalEmail)
      : undefined;

  const beginEdit = useCallback(() => {
    setEditError(null);
    editLinksHydratedRef.current = false;
    const p = profileQuery.data?.profile;
    const me = auth.status === "authenticated" ? auth.myProfile : null;
    if (p) {
      setDraftPersonalEmail(me?.personalEmail ?? "");
      setDraftMobilePhone(me?.mobilePhone ?? "");
      setDraftResidenceCountry(p.residenceCountry ?? "");
      setDraftResidenceCity(p.residenceCity ?? "");
      setDraftOpenTo(openToPreferencesForEdit(parseOpenToPreferences(p.openToPreferences) ?? null));
    }
    setDraftOccupations(occupationsToDrafts(profileQuery.data?.occupations ?? []));
    clearOrganizationIdCache();
    setDraftSocialLinks(socialLinksDraftFromProfile(profileQuery.data?.links ?? []));
    setIsEditing(true);
  }, [profileQuery.data, auth]);

  useEffect(() => {
    const editMode = searchParams.get("edit");
    if (!isOwnProfile || isEditing || editMode !== "contact") return;
    const t = window.setTimeout(() => {
      beginEdit();
    }, 0);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("edit");
      return next;
    }, { replace: true });
    return () => window.clearTimeout(t);
  }, [searchParams, isOwnProfile, isEditing, beginEdit, setSearchParams]);

  const cancelEdit = useCallback(() => {
    setOpenSocialPlatform(null);
    setIsEditing(false);
    setEditError(null);
    if (id) void queryClient.invalidateQueries({ queryKey: queryKeys.profiles.detail(id) });
  }, [id, queryClient]);

  const updateDraftOccupation = useCallback((occId: string, patch: Partial<OccupationDraft>) => {
    setDraftOccupations((prev) => {
      let next = prev.map((d) => (d.id === occId ? { ...d, ...patch } : d));
      if (patch.isCurrent === true) {
        next = next.map((d) => (d.id === occId ? d : { ...d, isCurrent: false }));
      }
      return next;
    });
    setEditError(null);
  }, []);

  const commitExperienceDraft = useCallback((draft: OccupationDraft) => {
    setDraftOccupations((prev) => {
      const exists = prev.some((d) => d.id === draft.id);
      let next = exists
        ? prev.map((d) => (d.id === draft.id ? draft : d))
        : [...prev, draft];
      if (draft.isCurrent) {
        next = next.map((d) => (d.id === draft.id ? d : { ...d, isCurrent: false }));
      }
      return next;
    });
    setEditError(null);
  }, []);

  const removeDraftExperience = useCallback((occId: string) => {
    setDraftOccupations((prev) => prev.filter((d) => d.id !== occId || !d.isNew));
    setEditError(null);
  }, []);

  const persistSocialLinks = useCallback(async (): Promise<string | null> => {
    const sourceLinks = isEditing ? editLinks : (data?.links ?? []);
    const existingByKey = new Map<SocialPlatformKey, ProfileLinkView>();
    for (const link of sourceLinks) {
      const key = linkToSocialPlatformKey(link);
      if (key && !existingByKey.has(key)) existingByKey.set(key, link);
    }

    for (const key of SOCIAL_PLATFORM_ORDER) {
      const raw = draftSocialLinks[key];
      const normalized = normalizeSocialUrl(raw);
      const platform = socialPlatformLabel(key);
      const existing = existingByKey.get(key);

      if (!normalized) {
        if (raw.trim()) {
          return `Enter a valid ${platform} URL.`;
        }
        if (existing) {
          const { error } = await api.delete(`/v1/me/links/${existing.id}`);
          if (error) {
            return error.message ?? error.code;
          }
          existingByKey.delete(key);
        }
        continue;
      }

      if (existing) {
        if (existing.url === normalized) continue;
        const { data: updated, error } = await api.patch<{ link: ProfileLinkView }>(
          `/v1/me/links/${existing.id}`,
          { platform, url: normalized, label: null },
        );
        if (error) {
          return error.message ?? error.code;
        }
        if (updated?.link) existingByKey.set(key, updated.link);
      } else {
        const { data: created, error } = await api.post<{ link: ProfileLinkView }>("/v1/me/links", {
          platform,
          url: normalized,
          label: null,
        });
        if (error) {
          return error.message ?? error.code;
        }
        if (created?.link) existingByKey.set(key, created.link);
      }
    }

    return null;
  }, [data?.links, draftSocialLinks, editLinks, isEditing]);

  const saveProfileEdits = useCallback(async () => {
    if (!data) return;
    setSaving(true);
    setEditError(null);
    clearOrganizationIdCache();

    // Check everything BEFORE the first write, so a typo can't leave a half-saved profile.
    const preflightError = preflightProfileEdits(draftOccupations, draftSocialLinks, draftPersonalEmail);
    if (preflightError) {
      setSaving(false);
      setEditError(preflightError);
      return;
    }

    const { error: profileError } = await api.patch("/v1/me/profile", {
      personalEmail: draftPersonalEmail.trim() || null,
      mobilePhone: draftMobilePhone.trim() || null,
      residenceCountry: draftResidenceCountry.trim() || null,
      residenceCity: draftResidenceCity.trim() || null,
      openToPreferences: normalizeOpenToPreferences(draftOpenTo),
    });
    if (profileError) {
      setSaving(false);
      setEditError(profileError.message ?? profileError.code);
      return;
    }

    for (const draft of draftOccupations) {
      const validation = validateOccupationDraft(draft);
      if (validation) {
        setSaving(false);
        setEditError(validation);
        return;
      }
      try {
        const organizationId = await resolveOrganizationId(draft.organizationName);
        if (draft.isNew) {
          const { error: occError } = await api.post(
            "/v1/me/occupations",
            buildOccupationCreatePayload(draft, organizationId),
          );
          if (occError) {
            setSaving(false);
            setEditError(occError.message ?? occError.code);
            return;
          }
        } else {
          const { error: occError } = await api.patch(
            `/v1/me/occupations/${draft.id}`,
            buildOccupationPatchPayload(draft, organizationId),
          );
          if (occError) {
            setSaving(false);
            setEditError(occError.message ?? occError.code);
            return;
          }
        }
      } catch (err) {
        setSaving(false);
        setEditError(err instanceof Error ? err.message : "Could not save experience.");
        return;
      }
    }

    const linkErr = await persistSocialLinks();
    if (linkErr) {
      setSaving(false);
      setEditError(linkErr);
      return;
    }

    setSaving(false);
    await refetchAuth();
    if (id) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profiles.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.links() });
    }
    const refetched = await linksQuery.refetch();
    if (refetched.data?.links) {
      setEditLinks(refetched.data.links);
      setDraftSocialLinks(socialLinksDraftFromProfile(refetched.data.links));
    }
    setOpenSocialPlatform(null);
    setIsEditing(false);
  }, [
    data,
    draftPersonalEmail,
    draftMobilePhone,
    draftResidenceCountry,
    draftResidenceCity,
    draftOpenTo,
    draftOccupations,
    draftSocialLinks,
    persistSocialLinks,
    refetchAuth,
    id,
    queryClient,
    linksQuery,
  ]);

  const handleSaveSocialLinks = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const setLinkError = isEditing ? setEditError : setLinksError;
    setLinkError(null);
    if (!isEditing) setEditError(null);

    setLinksSaving(true);
    const linkErr = await persistSocialLinks();
    setLinksSaving(false);
    if (linkErr) {
      setLinkError(linkErr);
      return;
    }

    await refetchAuth();
    if (id) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profiles.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.links() });
    }
    if (isEditing) {
      const refetched = await linksQuery.refetch();
      if (refetched.data?.links) {
        setEditLinks(refetched.data.links);
        setDraftSocialLinks(socialLinksDraftFromProfile(refetched.data.links));
      }
    }
    setOpenSocialPlatform(null);
  };

  const updateSocialDraft = (key: SocialPlatformKey, value: string) => {
    setDraftSocialLinks((prev) => ({ ...prev, [key]: value }));
    if (isEditing) setEditError(null);
    else setLinksError(null);
  };

  const openSocialEditor = useCallback(
    (key: SocialPlatformKey) => {
      setLinksError(null);
      setEditError(null);
      const sourceLinks = isEditing ? editLinks : (linksQuery.data?.links ?? data?.links ?? []);
      setDraftSocialLinks(socialLinksDraftFromProfile(sourceLinks));
      setOpenSocialPlatform(key);
    },
    [isEditing, editLinks, linksQuery.data, data?.links],
  );

  const closeSocialEditor = useCallback(() => {
    setOpenSocialPlatform(null);
  }, []);

  const adminAllowedEmails = useMemo(
    () =>
      [...(adminAllowedEmailsQuery.data ?? [])].sort((a, b) =>
        a.email.localeCompare(b.email, undefined, { sensitivity: "base" }),
      ),
    [adminAllowedEmailsQuery.data],
  );

  const addAdminAllowedEmail = useCallback(async () => {
    const institutionalEmail = adminEmailDraft.trim();
    if (!institutionalEmail) return;
    setAdminAllowlistBusy(true);
    setAdminAllowlistError(null);
    const { error } = await api.post("/v1/admin/allowed-admin-emails", {
      institutionalEmail,
    });
    setAdminAllowlistBusy(false);
    if (error) {
      setAdminAllowlistError(error.message ?? error.code);
      return;
    }
    setAdminEmailDraft("");
    await adminAllowedEmailsQuery.refetch();
  }, [adminAllowedEmailsQuery, adminEmailDraft]);

  const revokeAdminAllowedEmail = useCallback(async (institutionalEmail: string) => {
    setAdminAllowlistBusy(true);
    setAdminAllowlistError(null);
    const { error } = await api.post("/v1/admin/allowed-admin-emails/revoke", {
      institutionalEmail,
    });
    setAdminAllowlistBusy(false);
    if (error) {
      setAdminAllowlistError(error.message ?? error.code);
      return;
    }
    await adminAllowedEmailsQuery.refetch();
  }, [adminAllowedEmailsQuery]);

  const handleDeleteLink = async (linkId: string) => {
    setEditError(null);
    setLinkBusyId(linkId);
    const { error } = await api.delete(`/v1/me/links/${linkId}`);
    setLinkBusyId(null);
    if (error) {
      setEditError(error.message ?? error.code);
      return;
    }
    setEditLinks((prev) => prev.filter((l) => l.id !== linkId));
    await refetchAuth();
    if (id) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profiles.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.links() });
    }
  };

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

  const profile = data?.profile;
  const occupations = data?.occupations ?? [];
  const links = data?.links ?? [];
  const profileDisplayName =
    (profile?.fullName ?? "").trim() || "Profile";
  const onboardingIncomplete =
    isOwnProfile && auth.status === "authenticated" && !auth.myProfile?.onboardingCompletedAt;
  const adminMetrics = adminMetricsQuery.data;
  const sidebarOtherLinks =
    !loading && isOwnProfile && isEditing ? otherProfileLinks(editLinks) : [];
  const showProfileSidebar = sidebarOtherLinks.length > 0;

  return (
    <>
      <Nav variant="home" avatarName={navAvatarName} />
      <div className="home-dashboard profile-page">
        {/* Messaging paused: Message button on other people's profiles hidden while messaging is commented out.
            The removed ProfileHero prop was:
          onSendMessage={
            !isOwnProfile && profile
              ? () => {
                  window.dispatchEvent(
                    new CustomEvent("messaging:open-draft", {
                      detail: {
                        recipientPersonId: profile.id,
                        recipientName: profileDisplayName,
                        initialMessage: "",
                        kind: "general",
                        recipientDepartmentCode: profile.departmentCode,
                        recipientBatchYear: profile.batchYear,
                      },
                    }),
                  );
                }
              : undefined
          }
        */}
        <ProfileHero
          loading={loading}
          profile={profile}
          occupations={occupations}
          links={isEditing ? editLinks : links}
          profileDisplayName={profileDisplayName}
          isOwnProfile={isOwnProfile}
          isEditing={isEditing}
          onEdit={isOwnProfile && !isEditing ? () => void beginEdit() : undefined}
          onCancelEdit={isOwnProfile && isEditing ? () => void cancelEdit() : undefined}
          onSaveEdit={isOwnProfile && isEditing ? () => void saveProfileEdits() : undefined}
          saving={saving}
          openSocialPlatform={isOwnProfile ? openSocialPlatform : null}
          onOpenSocialPlatform={isOwnProfile ? openSocialEditor : undefined}
          onCloseSocialPlatform={isOwnProfile ? closeSocialEditor : undefined}
          socialDraft={isOwnProfile ? draftSocialLinks : undefined}
          onSocialDraftChange={isOwnProfile ? updateSocialDraft : undefined}
          onSaveSocialLinks={isOwnProfile ? () => void handleSaveSocialLinks() : undefined}
          socialLinksBusy={linksSaving}
          socialLinksError={isEditing ? editError : linksError}
        />

        <div className="profile-page__engage-wrap">
          <section className="profile-page__engage-row" aria-label="Profile highlights">
            <ProfileEngagementCards
              loading={loading}
              openToPreferences={parseOpenToPreferences(profile?.openToPreferences) ?? null}
              isEditing={isOwnProfile && isEditing}
              draftOpenTo={isEditing ? draftOpenTo : undefined}
              onDraftOpenToChange={isEditing ? setDraftOpenTo : undefined}
            />
            <ProfileExperience
              loading={loading}
              occupations={occupations}
              profile={profile}
              isOwnProfile={isOwnProfile}
              onboardingIncomplete={onboardingIncomplete}
              isEditing={isOwnProfile && isEditing}
              draftOccupations={isEditing ? draftOccupations : undefined}
              onDraftOccupationChange={isEditing ? updateDraftOccupation : undefined}
              onCommitExperience={isEditing ? commitExperienceDraft : undefined}
              onRemoveExperience={isEditing ? removeDraftExperience : undefined}
            />
          </section>
        </div>

        <div
          className={`home-dashboard__main${showProfileSidebar ? "" : " profile-page__main--no-sidebar"}`}
        >
          <div className="home-dashboard__col home-dashboard__col--wide profile-page__sections">
            {isOwnProfile && isEditing && editError ? (
              <p className="body-text profile-page__error-text">
                {editError}
              </p>
            ) : null}

            <ProfileIitBhu
              loading={loading}
              profile={profile}
              isOwnProfile={isOwnProfile}
              onboardingIncomplete={onboardingIncomplete}
            />

            <ProfileAbout
              loading={loading}
              profile={profile}
              isOwnProfile={isOwnProfile}
              isEditing={isEditing}
              draftPersonalEmail={draftPersonalEmail}
              draftMobilePhone={draftMobilePhone}
              draftResidenceCountry={draftResidenceCountry}
              draftResidenceCity={draftResidenceCity}
              onDraftPersonalEmail={setDraftPersonalEmail}
              onDraftMobilePhone={setDraftMobilePhone}
              onDraftResidenceCountry={setDraftResidenceCountry}
              onDraftResidenceCity={setDraftResidenceCity}
            />

            {isOwnProfile && isAdminViewer ? (
              <article id="admin-analytics" className="home-dashboard__card profile-page__analytics-card">
                <div className="profile-page__analytics-header">
                  <h2 className="profile-page__section-title">Admin analytics dashboard</h2>
                  <button
                    type="button"
                    className="nav__profile-edit nav__profile-edit--ghost"
                    onClick={() => void adminMetricsQuery.refetch()}
                    disabled={adminMetricsQuery.isFetching}
                  >
                    {adminMetricsQuery.isFetching ? "Refreshing…" : "Refresh"}
                  </button>
                </div>

                {adminMetricsQuery.isPending ? (
                  <p className="body-text profile-page__muted-text">Loading analytics…</p>
                ) : adminMetricsQuery.isError || !adminMetrics ? (
                  <p className="body-text profile-page__error-text">
                    Could not load admin analytics right now.
                  </p>
                ) : (
                  <div className="profile-page__analytics-grid">
                    <p className="body-text profile-page__muted-text profile-page__analytics-scope-note">
                      Usage, funnel, and KPI rows below count only <strong>beta alumni</strong> (real profiles), excluding demo
                      bios, e2e test users, and admin accounts. Directory totals show the full split.
                    </p>
                    <section className="profile-page__analytics-section">
                      <h3 className="profile-page__analytics-title">Directory totals</h3>
                      <ul className="profile-page__analytics-list">
                        <li><span>Total people</span><strong>{adminMetrics.totalPeople}</strong></li>
                        <li><span>Beta alumni profiles</span><strong>{adminMetrics.directoryMix.betaProfiles}</strong></li>
                        <li><span>Demo profiles</span><strong>{adminMetrics.directoryMix.demoProfiles}</strong></li>
                        <li><span>Admin profiles</span><strong>{adminMetrics.directoryMix.adminProfiles}</strong></li>
                        <li><span>Test (e2e) alumni</span><strong>{adminMetrics.directoryMix.testProfiles}</strong></li>
                        <li><span>Beta — profiles completed</span><strong>{adminMetrics.directoryMix.betaProfilesCompleted}</strong></li>
                        <li><span>Beta — searchable</span><strong>{adminMetrics.directoryMix.betaProfilesSearchable}</strong></li>
                        <li><span>All profiles completed</span><strong>{adminMetrics.profileCompletedCount}</strong></li>
                        <li><span>All searchable profiles</span><strong>{adminMetrics.searchableCount}</strong></li>
                        <li><span>All-time searches (all users)</span><strong>{adminMetrics.searchVolume}</strong></li>
                      </ul>
                    </section>

                    <section className="profile-page__analytics-section">
                      <h3 className="profile-page__analytics-title">Beta auth funnel</h3>
                      <ul className="profile-page__analytics-list">
                        <li><span>Invite attempts (total)</span><strong>{adminMetrics.betaAuthFunnel.attempts}</strong></li>
                        <li><span>Invite success (total)</span><strong>{adminMetrics.betaAuthFunnel.successes}</strong></li>
                        <li><span>Invite failures (total)</span><strong>{adminMetrics.betaAuthFunnel.failures}</strong></li>
                        <li><span>Rate limited (total)</span><strong>{adminMetrics.betaAuthFunnel.rateLimited}</strong></li>
                        <li><span>Attempts (24h)</span><strong>{adminMetrics.betaAuthFunnel.attempts24h}</strong></li>
                        <li><span>Success (24h)</span><strong>{adminMetrics.betaAuthFunnel.successes24h}</strong></li>
                        <li><span>Failures (24h)</span><strong>{adminMetrics.betaAuthFunnel.failures24h}</strong></li>
                        <li><span>Rate limited (24h)</span><strong>{adminMetrics.betaAuthFunnel.rateLimited24h}</strong></li>
                      </ul>
                    </section>

                    <section className="profile-page__analytics-section">
                      <h3 className="profile-page__analytics-title">Tracked usage — beta only (last 24h)</h3>
                      <ul className="profile-page__analytics-list">
                        <li><span>Onboarding started</span><strong>{adminMetrics.betaUsage.onboardingStarted24h}</strong></li>
                        <li><span>Onboarding completed</span><strong>{adminMetrics.betaUsage.onboardingCompleted24h}</strong></li>
                        <li><span>Searches executed</span><strong>{adminMetrics.betaUsage.searchExecuted24h}</strong></li>
                        <li><span>Zero-result searches</span><strong>{adminMetrics.betaUsage.searchZeroResults24h}</strong></li>
                        <li><span>Profiles viewed</span><strong>{adminMetrics.betaUsage.profileViewed24h}</strong></li>
                        <li><span>Profiles clicked</span><strong>{adminMetrics.betaUsage.profileClicked24h}</strong></li>
                        <li><span>Threads created</span><strong>{adminMetrics.betaUsage.threadCreated24h}</strong></li>
                        <li><span>Thread messages sent</span><strong>{adminMetrics.betaUsage.threadMessageSent24h}</strong></li>
                        <li><span>Intentcasts posted</span><strong>{adminMetrics.betaUsage.intentcastPosted24h}</strong></li>
                        <li><span>Intentcasts responded</span><strong>{adminMetrics.betaUsage.intentcastResponded24h}</strong></li>
                      </ul>
                    </section>

                    <section className="profile-page__analytics-section">
                      <h3 className="profile-page__analytics-title">Beta funnel (last 24h)</h3>
                      <ul className="profile-page__analytics-list">
                        <li><span>Auth success</span><strong>{adminMetrics.betaFunnel24h.authSuccesses}</strong></li>
                        <li><span>Onboarding started</span><strong>{adminMetrics.betaFunnel24h.onboardingStarted}</strong></li>
                        <li><span>Onboarding completed</span><strong>{adminMetrics.betaFunnel24h.onboardingCompleted}</strong></li>
                        <li><span>Searches executed</span><strong>{adminMetrics.betaFunnel24h.searchesExecuted}</strong></li>
                        <li><span>Profiles clicked</span><strong>{adminMetrics.betaFunnel24h.profilesClicked}</strong></li>
                        <li><span>High-intent actions</span><strong>{adminMetrics.betaFunnel24h.highIntentActions}</strong></li>
                      </ul>
                    </section>

                    <section className="profile-page__analytics-section">
                      <h3 className="profile-page__analytics-title">Core beta KPIs</h3>
                      <ul className="profile-page__analytics-list">
                        <li><span>Onboarding completion rate (24h)</span><strong>{adminMetrics.betaKpis.onboardingCompletionRate24h}%</strong></li>
                        <li><span>Discovery CTR (24h)</span><strong>{adminMetrics.betaKpis.discoveryCtr24h}%</strong></li>
                        <li><span>Connection conversion (24h)</span><strong>{adminMetrics.betaKpis.connectionConversionRate24h}%</strong></li>
                        <li><span>Intentcast response rate (24h)</span><strong>{adminMetrics.betaKpis.intentcastResponseRate24h}%</strong></li>
                        <li><span>Active users (24h)</span><strong>{adminMetrics.betaKpis.activeUsers24h}</strong></li>
                        <li><span>Active users (7d)</span><strong>{adminMetrics.betaKpis.activeUsers7d}</strong></li>
                        <li><span>Repeat users (7d)</span><strong>{adminMetrics.betaKpis.repeatUsers7d}</strong></li>
                      </ul>
                    </section>

                    <section className="profile-page__analytics-section">
                      <h3 className="profile-page__analytics-title">Admin email allowlist</h3>
                      <form
                        className="profile-page__admin-allowlist-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void addAdminAllowedEmail();
                        }}
                      >
                        <Input
                          label="Institutional email"
                          type="email"
                          value={adminEmailDraft}
                          onChange={(event) => setAdminEmailDraft(event.target.value)}
                          placeholder="name@itbhu.ac.in"
                        />
                        <Button type="submit" variant="secondary" disabled={adminAllowlistBusy || !adminEmailDraft.trim()}>
                          {adminAllowlistBusy ? "Saving…" : "Add admin email"}
                        </Button>
                      </form>

                      {adminAllowlistError ? (
                        <p className="body-text profile-page__error-text">{adminAllowlistError}</p>
                      ) : null}

                      {adminAllowedEmailsQuery.isPending ? (
                        <p className="body-text profile-page__muted-text">Loading admin emails…</p>
                      ) : adminAllowedEmailsQuery.isError ? (
                        <p className="body-text profile-page__error-text">Could not load admin email allowlist.</p>
                      ) : adminAllowedEmails.length === 0 ? (
                        <p className="body-text profile-page__muted-text">No admin emails added yet.</p>
                      ) : (
                        <ul className="profile-page__analytics-list profile-page__admin-allowlist-list">
                          {adminAllowedEmails.map((entry) => (
                            <li key={entry.id}>
                              <span>
                                {entry.email}
                                {entry.status === "revoked" ? " (revoked)" : ""}
                              </span>
                              {entry.status === "active" ? (
                                <button
                                  type="button"
                                  className="profile-page__link-remove"
                                  disabled={adminAllowlistBusy}
                                  onClick={() => void revokeAdminAllowedEmail(entry.email)}
                                >
                                  Revoke
                                </button>
                              ) : (
                                <span className="profile-page__muted-label">Inactive</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    {/* Beta user allowlist UI removed while invite login skips DB allowlist (see authService.loginWithInviteCode). */}
                  </div>
                )}
              </article>
            ) : null}

            {isOwnProfile && !isEditing && auth.status === "authenticated" ? (
              <div className="profile-page__signout">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void auth.logout().then(() => navigate("/", { replace: true }));
                  }}
                >
                  Sign out
                </Button>
              </div>
            ) : null}
          </div>

          {showProfileSidebar ? (
            <aside className="home-dashboard__col home-dashboard__col--side">
              <article className="home-dashboard__card">
                <h2 className="profile-page__section-title">Other links</h2>
                <ul className="profile-page__links-editor profile-page__links-editor--other">
                  {sidebarOtherLinks.map((link) => (
                    <li key={link.id}>
                      <a href={link.url} target="_blank" rel="noopener noreferrer">
                        {link.platform}
                      </a>
                      <button
                        type="button"
                        className="profile-page__link-remove"
                        disabled={linkBusyId === link.id}
                        onClick={() => void handleDeleteLink(link.id)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </article>
            </aside>
          ) : null}
        </div>
      </div>
    </>
  );
}
