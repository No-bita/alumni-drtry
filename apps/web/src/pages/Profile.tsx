import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Nav } from "../components/Nav";
import { Avatar } from "../components/Avatar";
import { ReachOutCard } from "../components/ReachOutCard";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { PageStateBlock } from "../components/PageStateBlock";
import {
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
  const [newPlatform, setNewPlatform] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [linkBusyId, setLinkBusyId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const editLinksHydratedRef = useRef(false);

  const isOwnProfile =
    auth.status === "authenticated" && auth.myProfile?.id != null && auth.myProfile.id === id;

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
    enabled: Boolean(isOwnProfile && isEditing),
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
    setNewPlatform("");
    setNewUrl("");
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

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const platform = newPlatform.trim();
    const url = newUrl.trim();
    if (!platform || !url) return;
    setEditError(null);
    setLinkBusyId("__add__");
    const { data: created, error } = await api.post<{ link: ProfileLinkView }>("/v1/me/links", {
      platform,
      url,
      label: null,
    });
    setLinkBusyId(null);
    if (error) {
      setEditError(error.message ?? error.code);
      return;
    }
    if (created?.link) setEditLinks((prev) => [...prev, created.link]);
    setNewPlatform("");
    setNewUrl("");
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

  if (loading) {
    return (
      <>
        <Nav variant="home" avatarName={navAvatarName} />
        <div className="home-dashboard profile-page">
          <div className="profile-page__loading">
            <PageStateBlock title="Loading profile" description="Please wait a moment." />
          </div>
        </div>
      </>
    );
  }

  if (profileQuery.isError || !data) {
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

  const { profile, occupations, links } = data;
  const batch = profile.batchYear ?? profile.parsedJoiningYear ?? "—";
  const residenceCity = profile.residenceCity?.trim() ?? "";
  const residenceCountry = profile.residenceCountry?.trim() ?? "";
  const residenceLabel =
    residenceCity && residenceCountry
      ? `${residenceCity}, ${residenceCountry}`
      : residenceCity || residenceCountry;

  const displayLinks = isEditing ? editLinks : links;

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
                <Avatar
                  name={profile.fullName ?? "?"}
                  size="lg"
                  tone="pastel"
                  departmentCode={profile.departmentCode}
                />
                <div>
                  <h1 id="profile-hero-heading" className="home-dashboard__hero-title">
                    {profile.fullName}
                  </h1>
                </div>
              </div>
              <div className="profile-page__meta" role="list">
                <span role="listitem">
                  Batch <strong>{batch}</strong>
                </span>
                <span role="listitem">
                  Dept <strong>{profile.departmentName ?? profile.departmentCode ?? "—"}</strong>
                </span>
                {residenceLabel ? (
                  <span role="listitem">
                    Residence <strong>{residenceLabel}</strong>
                  </span>
                ) : null}
                {isOwnProfile && profile.mobilePhone ? (
                  <span role="listitem">
                    Mobile <strong>{profile.mobilePhone}</strong>
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

            {profile.residenceCountry ||
            profile.residenceCity ||
            (isOwnProfile && (profile.personalEmail || profile.mobilePhone)) ||
            (isOwnProfile && isEditing) ? (
              <article className="home-dashboard__card">
                <h2 className="profile-page__section-title">About</h2>
                {/* Bio field/display removed — restore Textarea + draftBio + PATCH `bio` if needed */}
                {isOwnProfile && !isEditing && (profile.personalEmail || profile.mobilePhone) ? (
                  <div className="body-text profile-page__contact-summary">
                    {profile.personalEmail ? (
                      <p className="profile-page__contact-row">
                        <span className="profile-page__contact-label">Personal email</span>
                        <br />
                        {profile.personalEmail}
                      </p>
                    ) : null}
                    {profile.mobilePhone ? (
                      <p className="profile-page__contact-row profile-page__contact-row--last">
                        <span className="profile-page__contact-label">Mobile</span>
                        <br />
                        {profile.mobilePhone}
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

            {occupations.length > 0 ? (
              <article className="home-dashboard__card">
                <h2 className="profile-page__section-title">Experience</h2>
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
          </div>

          <aside className="home-dashboard__col home-dashboard__col--side">
            {!isOwnProfile ? (
              <ReachOutCard
                profileId={profile.id}
                profileName={profile.fullName ?? "them"}
                onSubmit={handleReachOut}
                status={contactStatus}
                errorMessage={contactError}
              />
            ) : null}
            {displayLinks.length > 0 || isOwnProfile ? (
              <div className="home-dashboard__card">
                <span className="eyebrow profile-page__links-eyebrow">
                  Links
                </span>
                {isOwnProfile && isEditing ? (
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
                    <form className="profile-page__add-link" onSubmit={(e) => void handleAddLink(e)}>
                      <Input label="Platform" value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)} placeholder="e.g. LinkedIn" />
                      <Input label="URL" type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://…" />
                      <Button type="submit" variant="secondary" disabled={linkBusyId === "__add__" || !newPlatform.trim() || !newUrl.trim()}>
                        {linkBusyId === "__add__" ? "Adding…" : "Add link"}
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
