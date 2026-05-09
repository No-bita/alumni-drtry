import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DeptBatchMeta } from "../components/DeptBatchMeta";
import { Nav } from "../components/Nav";
import { Avatar } from "../components/Avatar";
import { ReachOutCard } from "../components/ReachOutCard";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { PageStateBlock } from "../components/PageStateBlock";
import {
  type AdminAllowedEmailsResponse,
  type AdminMetricsResponse,
  api,
  type CreateConnectionThreadResponse,
  type MeLinksResponse,
  type ProfileLinkView,
  type ProfileResponse,
} from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { assertApiGet } from "../lib/assertApiGet";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";
import { invalidateConnectionThreadQueries } from "../lib/invalidateAppQueries";
import { queryKeys } from "../lib/queryKeys";
import { demoDisplayFullName, isDemoProfileBio } from "../lib/demoProfile";

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function inferPlatformFromUrl(rawUrl: string): string {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
    if (host.includes("linkedin.")) return "LinkedIn";
    if (host.includes("github.")) return "GitHub";
    if (host === "x.com" || host.includes("twitter.")) return "X/Twitter";
    if (host.includes("instagram.")) return "Instagram";
    if (host.includes("youtube.")) return "YouTube";
    const label = host.split(".")[0] ?? "Website";
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : "Website";
  } catch {
    return "Website";
  }
}

function normalizeProfileLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function Profile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const refetchAuth = auth.refetch;
  const [contactStatus, setContactStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [contactError, setContactError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [draftPersonalEmail, setDraftPersonalEmail] = useState("");
  const [draftMobilePhone, setDraftMobilePhone] = useState("");
  const [draftResidenceCountry, setDraftResidenceCountry] = useState("");
  const [draftResidenceCity, setDraftResidenceCity] = useState("");
  const [editLinks, setEditLinks] = useState<ProfileLinkView[]>([]);
  const [newLinksText, setNewLinksText] = useState("");
  const [saving, setSaving] = useState(false);
  const [linkBusyId, setLinkBusyId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [adminEmailDraft, setAdminEmailDraft] = useState("");
  const [adminNotesDraft, setAdminNotesDraft] = useState("");
  const [adminAllowlistBusy, setAdminAllowlistBusy] = useState(false);
  const [adminAllowlistError, setAdminAllowlistError] = useState<string | null>(null);
  const editLinksHydratedRef = useRef(false);

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
  const isDemoProfile = isDemoProfileBio(data?.profile.bio);

  const linksQuery = useQuery({
    queryKey: queryKeys.me.links(),
    queryFn: ({ signal }) => assertApiGet<MeLinksResponse>("/v1/me/links", signal),
    enabled: Boolean(isOwnProfile && isEditing),
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
      setEditLinks(linksQuery.data!.links);
    });
  }, [isEditing, linksQuery.data]);

  const handleReachOut = async (message: string) => {
    if (!id) return;
    setContactStatus("sending");
    setContactError(null);
    const { data, error } = await api.post<CreateConnectionThreadResponse>("/v1/connection-threads", {
      recipientPersonId: id,
      initialMessage: message,
    });
    if (error) {
      setContactStatus("error");
      setContactError(error.message ?? error.code);
      return;
    }
    const threadId = data?.threadId;
    if (!threadId) {
      setContactStatus("error");
      setContactError("No conversation id returned.");
      return;
    }
    setContactStatus("idle");
    invalidateConnectionThreadQueries();
    navigate(`/connections/${threadId}`);
  };

  const navAvatarName =
    auth.status === "authenticated"
      ? displayFirstNameFromEmail(auth.person.institutionalEmail)
      : undefined;

  const beginEdit = useCallback(() => {
    setEditError(null);
    editLinksHydratedRef.current = false;
    const p = profileQuery.data?.profile;
    if (p) {
      setDraftPersonalEmail(p.personalEmail ?? "");
      setDraftMobilePhone(p.mobilePhone ?? "");
      setDraftResidenceCountry(p.residenceCountry ?? "");
      setDraftResidenceCity(p.residenceCity ?? "");
    }
    setNewLinksText("");
    setIsEditing(true);
  }, [profileQuery.data]);

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
    setIsEditing(false);
    setEditError(null);
    if (id) void queryClient.invalidateQueries({ queryKey: queryKeys.profiles.detail(id) });
  }, [id, queryClient]);

  const saveProfileFields = useCallback(async () => {
    if (!data) return;
    setSaving(true);
    setEditError(null);
    const { error } = await api.patch("/v1/me/profile", {
      personalEmail: draftPersonalEmail.trim() || null,
      mobilePhone: draftMobilePhone.trim() || null,
      residenceCountry: draftResidenceCountry.trim() || null,
      residenceCity: draftResidenceCity.trim() || null,
    });
    setSaving(false);
    if (error) {
      setEditError(error.message ?? error.code);
      return;
    }
    await refetchAuth();
    if (id) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profiles.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.links() });
    }
    setIsEditing(false);
  }, [
    data,
    draftPersonalEmail,
    draftMobilePhone,
    draftResidenceCountry,
    draftResidenceCity,
    refetchAuth,
    id,
    queryClient,
  ]);

  const handleAddLinks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editLinks.length >= 5) {
      setEditError("You can add up to 5 links.");
      return;
    }
    const rawItems = newLinksText
      .split(/[\n,]/g)
      .map((item) => item.trim())
      .filter(Boolean);
    if (rawItems.length === 0) return;
    const normalizedItems = rawItems
      .map((item) => normalizeProfileLinkUrl(item))
      .filter((item): item is string => Boolean(item));
    if (normalizedItems.length === 0) {
      setEditError("Add valid URLs (example: linkedin.com/in/username).");
      return;
    }
    const uniqueUrls = [...new Set(normalizedItems)];
    const remainingSlots = 5 - editLinks.length;
    if (uniqueUrls.length > remainingSlots) {
      setEditError(`You can add ${remainingSlots} more link${remainingSlots === 1 ? "" : "s"} (max 5).`);
      return;
    }
    setEditError(null);
    setLinkBusyId("__add__");
    const createdLinks: ProfileLinkView[] = [];
    for (const url of uniqueUrls) {
      const platform = inferPlatformFromUrl(url);
      const { data: created, error } = await api.post<{ link: ProfileLinkView }>("/v1/me/links", {
        platform,
        url,
        label: null,
      });
      if (error) {
        setLinkBusyId(null);
        setEditError(error.message ?? error.code);
        if (createdLinks.length > 0) {
          setEditLinks((prev) => [...prev, ...createdLinks]);
        }
        return;
      }
      if (created?.link) createdLinks.push(created.link);
    }
    setLinkBusyId(null);
    if (createdLinks.length > 0) setEditLinks((prev) => [...prev, ...createdLinks]);
    setNewLinksText("");
    await refetchAuth();
    if (id) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profiles.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me.links() });
    }
  };

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
    demoDisplayFullName(profile?.fullName ?? "") || profile?.fullName?.trim() || "Profile";
  const codeRawHero = profile?.departmentCode;
  const deptCodeHero = codeRawHero?.trim() ? codeRawHero : null;
  const batchNumHero =
    typeof profile?.batchYear === "number" && Number.isFinite(profile.batchYear) ? profile.batchYear : null;
  const degreeLabel =
    profile?.degreeName?.trim() ||
    profile?.degreeCode?.trim() ||
    (isOwnProfile
      ? auth.myProfile?.degreeName?.trim() || auth.myProfile?.degreeCode?.trim() || null
      : null);
  const residenceCity = profile?.residenceCity?.trim() ?? "";
  const residenceCountry = profile?.residenceCountry?.trim() ?? "";
  const residenceLabel =
    residenceCity && residenceCountry
      ? `${residenceCity}, ${residenceCountry}`
      : residenceCity || residenceCountry;
  const displayLinks = isEditing ? editLinks : links;
  const adminMetrics = adminMetricsQuery.data;
  const adminAllowedEmails = adminAllowedEmailsQuery.data ?? [];

  const addAdminAllowedEmail = useCallback(async () => {
    const institutionalEmail = adminEmailDraft.trim();
    if (!institutionalEmail) return;
    setAdminAllowlistBusy(true);
    setAdminAllowlistError(null);
    const { error } = await api.post("/v1/admin/allowed-admin-emails", {
      institutionalEmail,
      notes: adminNotesDraft.trim() || null,
    });
    setAdminAllowlistBusy(false);
    if (error) {
      setAdminAllowlistError(error.message ?? error.code);
      return;
    }
    setAdminEmailDraft("");
    setAdminNotesDraft("");
    await adminAllowedEmailsQuery.refetch();
  }, [adminAllowedEmailsQuery, adminEmailDraft, adminNotesDraft]);

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

  const navExtra =
    isOwnProfile && !isEditing ? (
      <button type="button" className="nav__profile-edit" onClick={() => void beginEdit()}>
        <PencilIcon />
        <span>Edit</span>
      </button>
    ) : isOwnProfile && isEditing ? (
      <div className="nav__profile-edit-actions">
        <button type="button" className="nav__profile-edit nav__profile-edit--ghost" onClick={() => void cancelEdit()} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="nav__profile-edit nav__profile-edit--primary" onClick={() => void saveProfileFields()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    ) : null;

  return (
    <>
      <Nav variant="home" avatarName={navAvatarName} extraRight={navExtra} />
      <div className="home-dashboard profile-page">
        <section className="home-dashboard__hero" aria-labelledby="profile-hero-heading">
          <div className="home-dashboard__hero-watermark" aria-hidden>
            IIT BHU
          </div>
          <div className="home-dashboard__hero-inner profile-page__hero-inner">
            <div className="home-dashboard__hero-left">
              <Link to="/search" className="profile-page__hero-back">
                ← Directory
              </Link>
              <div className="profile-page__hero-main">
                <Avatar name={profileDisplayName} size="lg" tone="pastel" />
                <div>
                  <h1 id="profile-hero-heading" className="home-dashboard__hero-title">
                    {loading ? <span className="profile-page__skeleton-line profile-page__skeleton-line--title" /> : profileDisplayName}
                    {!loading && isDemoProfile ? <span className="badge badge--hiring profile-page__demo-badge">Demo</span> : null}
                  </h1>
                </div>
              </div>
              <div className="profile-page__meta" role="list">
                <span role="listitem" className="profile-page__meta-dept-batch">
                  {deptCodeHero || batchNumHero != null ? (
                    <DeptBatchMeta
                      className="dept-batch-meta"
                      departmentCode={deptCodeHero}
                      batchYear={batchNumHero}
                    />
                  ) : loading ? (
                    <span className="profile-page__skeleton-line profile-page__skeleton-line--meta" />
                  ) : (
                    <>
                      Dept / cohort <strong>—</strong>
                    </>
                  )}
                </span>
                {degreeLabel ? (
                  <span role="listitem">
                    Degree <strong>{degreeLabel}</strong>
                  </span>
                ) : null}
                {residenceLabel ? (
                  <span role="listitem">
                    Residence <strong>{residenceLabel}</strong>
                  </span>
                ) : null}
                {isOwnProfile && profile?.mobilePhone ? (
                  <span role="listitem">
                    Mobile <strong>{profile?.mobilePhone}</strong>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <div className="home-dashboard__main">
          <div className="home-dashboard__col home-dashboard__col--wide">
            {isOwnProfile && isEditing && editError ? (
              <p className="body-text profile-page__error-text">
                {editError}
              </p>
            ) : null}

            {loading ||
            profile?.residenceCountry ||
            profile?.residenceCity ||
            (isOwnProfile && (profile?.personalEmail || profile?.mobilePhone)) ||
            (isOwnProfile && isEditing) ? (
              <article className="home-dashboard__card">
                <h2 className="profile-page__section-title">About</h2>
                {/* Bio field/display removed — restore Textarea + draftBio + PATCH `bio` if needed */}
                {loading ? (
                  <div className="profile-page__skeleton-block">
                    <span className="profile-page__skeleton-line profile-page__skeleton-line--body" />
                    <span className="profile-page__skeleton-line profile-page__skeleton-line--body" />
                  </div>
                ) : isOwnProfile && !isEditing && (profile?.personalEmail || profile?.mobilePhone) ? (
                  <div className="body-text profile-page__contact-summary">
                    {profile?.personalEmail ? (
                      <p className="profile-page__contact-row">
                        <span className="profile-page__contact-label">Personal email</span>
                        <br />
                        {profile?.personalEmail}
                      </p>
                    ) : null}
                    {profile?.mobilePhone ? (
                      <p className="profile-page__contact-row profile-page__contact-row--last">
                        <span className="profile-page__contact-label">Mobile</span>
                        <br />
                        {profile?.mobilePhone}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {isOwnProfile && isEditing ? (
                  <div className="profile-page__edit-grid">
                    <Input
                      label="Personal email (optional)"
                      type="email"
                      autoComplete="email"
                      value={draftPersonalEmail}
                      onChange={(e) => setDraftPersonalEmail(e.target.value)}
                    />
                    <Input
                      label="Mobile (optional)"
                      type="tel"
                      autoComplete="tel"
                      value={draftMobilePhone}
                      onChange={(e) => setDraftMobilePhone(e.target.value)}
                    />
                    <Input
                      label="Country of residence (optional)"
                      value={draftResidenceCountry}
                      onChange={(e) => setDraftResidenceCountry(e.target.value)}
                      autoComplete="country-name"
                    />
                    <Input
                      label="City of residence (optional)"
                      value={draftResidenceCity}
                      onChange={(e) => setDraftResidenceCity(e.target.value)}
                      autoComplete="address-level2"
                    />
                  </div>
                ) : null}
              </article>
            ) : null}

            {loading || occupations.length > 0 ? (
              <article className="home-dashboard__card">
                <h2 className="profile-page__section-title">Experience</h2>
                {loading ? (
                  <div className="profile-page__skeleton-block">
                    <span className="profile-page__skeleton-line profile-page__skeleton-line--body" />
                    <span className="profile-page__skeleton-line profile-page__skeleton-line--body" />
                    <span className="profile-page__skeleton-line profile-page__skeleton-line--body" />
                  </div>
                ) : (
                  <ul className="profile-page__exp-list">
                    {occupations.map((occ) => (
                    <li key={occ.id} className="profile-page__exp-item">
                      <span
                        className={`profile-page__exp-dot ${occ.isCurrent ? "profile-page__exp-dot--current" : "profile-page__exp-dot--past"}`}
                        aria-hidden
                      />
                      <div>
                        <div className="ui-body profile-page__exp-role">
                          {occ.roleTitle}
                        </div>
                        <div className="profile-page__exp-company">
                          {occ.organizationName ?? "—"}
                        </div>
                        <div className="small-note profile-page__exp-period">
                          {occ.startDate ? occ.startDate.slice(0, 4) : "—"} –{" "}
                          {occ.isCurrent ? "Present" : occ.endDate ? occ.endDate.slice(0, 4) : "—"}
                        </div>
                      </div>
                    </li>
                    ))}
                  </ul>
                )}
              </article>
            ) : null}

            {!isOwnProfile && occupations.length === 0 ? (
              <article className="home-dashboard__card">
                <p className="body-text profile-page__muted-text profile-page__flush-text">
                  No experience listed yet.
                </p>
              </article>
            ) : null}
            {isOwnProfile && !isEditing && occupations.length === 0 ? (
              <article className="home-dashboard__card">
                <p className="body-text profile-page__muted-text profile-page__flush-text">
                  No experience yet. Use <strong>Edit</strong> in the header to add links or contact details.
                </p>
              </article>
            ) : null}

            {isOwnProfile && isAdminViewer ? (
              <article className="home-dashboard__card profile-page__analytics-card">
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
                    <section className="profile-page__analytics-section">
                      <h3 className="profile-page__analytics-title">Directory totals</h3>
                      <ul className="profile-page__analytics-list">
                        <li><span>Total people</span><strong>{adminMetrics.totalPeople}</strong></li>
                        <li><span>Profiles completed</span><strong>{adminMetrics.profileCompletedCount}</strong></li>
                        <li><span>Searchable profiles</span><strong>{adminMetrics.searchableCount}</strong></li>
                        <li><span>All-time searches</span><strong>{adminMetrics.searchVolume}</strong></li>
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
                      <h3 className="profile-page__analytics-title">Tracked usage (last 24h)</h3>
                      <ul className="profile-page__analytics-list">
                        <li><span>Searches executed</span><strong>{adminMetrics.betaUsage.searchExecuted24h}</strong></li>
                        <li><span>Profiles viewed</span><strong>{adminMetrics.betaUsage.profileViewed24h}</strong></li>
                        <li><span>Profiles clicked</span><strong>{adminMetrics.betaUsage.profileClicked24h}</strong></li>
                        <li><span>Threads created</span><strong>{adminMetrics.betaUsage.threadCreated24h}</strong></li>
                        <li><span>Thread messages sent</span><strong>{adminMetrics.betaUsage.threadMessageSent24h}</strong></li>
                        <li><span>Intentcasts posted</span><strong>{adminMetrics.betaUsage.intentcastPosted24h}</strong></li>
                        <li><span>Intentcasts responded</span><strong>{adminMetrics.betaUsage.intentcastResponded24h}</strong></li>
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
                        <Input
                          label="Notes (optional)"
                          type="text"
                          value={adminNotesDraft}
                          onChange={(event) => setAdminNotesDraft(event.target.value)}
                          placeholder="Why admin access is needed"
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
                  </div>
                )}
              </article>
            ) : null}
          </div>

          <aside className="home-dashboard__col home-dashboard__col--side">
            {!loading && !isOwnProfile && profile ? (
              <ReachOutCard
                profileId={profile.id}
                profileName={profileDisplayName}
                onSubmit={handleReachOut}
                status={contactStatus}
                errorMessage={contactError}
              />
            ) : null}
            {loading || displayLinks.length > 0 || isOwnProfile ? (
              <div className="home-dashboard__card">
                <span className="eyebrow profile-page__links-eyebrow">
                  Links
                </span>
                {loading ? (
                  <div className="profile-page__skeleton-block">
                    <span className="profile-page__skeleton-line profile-page__skeleton-line--body" />
                    <span className="profile-page__skeleton-line profile-page__skeleton-line--body" />
                  </div>
                ) : isOwnProfile && isEditing ? (
                  <>
                    {editLinks.length > 0 ? (
                      <ul className="profile-page__links-editor">
                        {editLinks.map((link) => (
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
                    ) : (
                      <p className="body-text profile-page__muted-text profile-page__links-empty">
                        No links yet.
                      </p>
                    )}
                    <form className="profile-page__add-link" onSubmit={(e) => void handleAddLinks(e)}>
                      <label className="ui-label" htmlFor="profile-links-input">
                        Add links (up to 5 total)
                      </label>
                      <textarea
                        id="profile-links-input"
                        className="input profile-page__links-input"
                        rows={3}
                        placeholder="Paste links separated by comma or new line"
                        value={newLinksText}
                        onChange={(e) => setNewLinksText(e.target.value)}
                      />
                      <p className="body-text profile-page__muted-text profile-page__links-helper">
                        Platform is detected automatically from each URL ({editLinks.length}/5 added).
                      </p>
                      <Button
                        type="submit"
                        variant="secondary"
                        disabled={linkBusyId === "__add__" || !newLinksText.trim() || editLinks.length >= 5}
                      >
                        {linkBusyId === "__add__" ? "Adding…" : "Add links"}
                      </Button>
                    </form>
                  </>
                ) : links.length > 0 ? (
                  <ul className="profile-page__links">
                    {links.map((link) => (
                      <li key={link.id}>
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          {link.platform}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="body-text profile-page__muted-text profile-page__links-empty profile-page__flush-text">
                    {isOwnProfile ? "No links yet. Use Edit in the header to add links." : null}
                  </p>
                )}
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  );
}
