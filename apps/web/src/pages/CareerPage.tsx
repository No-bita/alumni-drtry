import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Nav } from "../components/Nav";
import { Avatar } from "../components/Avatar";
import { DeptBatchMeta } from "../components/DeptBatchMeta";
import { CareerBestMatches, type CareerBestMatchRow } from "../components/CareerBestMatches";
import { PostRoleHiringFlow, type PostRoleHiringFlowHandle } from "../components/PostRoleHiringFlow";
import { Button } from "../components/Button";
import { Spinner } from "../components/Spinner";
import { api, type CreateConnectionThreadResponse, type SearchResult } from "../api/client";
import { careerPageReferralsHref } from "../constants/careerTabs";
import { DIRECTORY_INFINITE_QUERY_OPTIONS } from "../constants/directorySearch";
import { useAuth } from "../contexts/AuthContext";
import { assertApiGet } from "../lib/assertApiGet";
import { demoDisplayFullName } from "../lib/demoProfile";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";
import { queryKeys } from "../lib/queryKeys";
import { isDevHubPagesEnabled } from "../lib/devHubPages";

type ReferralSort = "most_relevant" | "alumni_match";
type ReferralRow = {
  id: string;
  name: string;
  titleLine: string;
  locationLine: string;
  departmentCode: string | null;
  batchYear: number | null;
  referralContextNote: string;
  chips: string[];
  alumniScore: number;
  bio: string | null;
  profileComplete: boolean;
};

function IconBriefcase({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 8V6a2 2 0 012.35-1.97 2 2 0 011.3 0A2 2 0 0115 6v2" />
      <rect x="4" y="8" width="16" height="13" rx="2.2" />
      <path d="M4 13h16" />
    </svg>
  );
}

function IconBuilding({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 21h18M5 21V10l7-4 7 4v11" />
      <path d="M9 21v-6h6v6M9 13h6M12 13V9" />
    </svg>
  );
}

function IconMapPin({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21s7-4.48 7-11a7 7 0 10-14 0c0 6.52 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.25" />
    </svg>
  );
}

function IconPencil({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L8 18l-4 1 1-4 11.5-11.5z" />
    </svg>
  );
}

function CareerOpportunitiesHub({
  onPostRole,
  hiringNotice,
  onDismissNotice,
}: {
  onPostRole: () => void;
  hiringNotice: string | null;
  onDismissNotice: () => void;
}) {
  return (
    <section className="career-hub" aria-labelledby="career-hub-title">
      <div className="career-hub__shell">
        {hiringNotice ? (
          <div className="career-hub__notice" role="status">
            <span>{hiringNotice}</span>
            <button type="button" className="career-hub__notice-dismiss" onClick={onDismissNotice}>
              Dismiss
            </button>
          </div>
        ) : null}
        <header className="career-hub__intro">
          <h2 id="career-hub-title" className="career-hub__title">
            Hire talent or land your next role
          </h2>
        </header>
        <div className="career-hub__grid">
          <article className="career-hub__panel ds-surface-card career-hub__panel--hire">
            <p className="career-hub__panel-eyebrow">For your team</p>
            <h3 className="career-hub__panel-title">Hire Alumni</h3>
            <p className="career-hub__panel-copy">
              Publish an opening with logistics, must-have skills, and how to apply. Responses arrive in Messages—no bulk exports or public
              résumé feeds.
            </p>
            <ul className="career-hub__panel-list">
              <li>Three-step composer with live preview</li>
              <li>Signals department and batch affinity automatically</li>
            </ul>
            <div className="career-hub__panel-actions">
              <button
                type="button"
                className="btn btn--secondary career-hub__cta career-hub__cta--magnetic"
                onClick={onPostRole}
              >
                <span>Post a role</span>
                <span className="career-hub__cta-icon" aria-hidden>
                  →
                </span>
              </button>
            </div>
          </article>
          <article className="career-hub__panel ds-surface-card career-hub__panel--seek">
            <p className="career-hub__panel-eyebrow">For your next move</p>
            <h3 className="career-hub__panel-title">Find Referrals</h3>
            <p className="career-hub__panel-copy">
              Match on company, title, and city, then message alumni who’ve done the work. Referral asks stay private until you send them.
            </p>
            <ul className="career-hub__panel-list">
              <li>Best-match spotlight before the full directory</li>
              <li>Optional resume attachment on each request</li>
            </ul>
            <div className="career-hub__panel-actions career-hub__panel-actions--stack">
              <Link
                to={careerPageReferralsHref()}
                className="btn btn--secondary career-hub__cta career-hub__cta--magnetic"
              >
                <span>Find referral intros</span>
                <span className="career-hub__cta-icon" aria-hidden>
                  →
                </span>
              </Link>
              {isDevHubPagesEnabled ? (
                <Link to="/intent/build" className="career-hub__secondary-link">
                  Browse Build for asks &amp; opportunities →
                </Link>
              ) : null}
            </div>
          </article>
        </div>
        <p className="career-hub__trust">
          Verified IIT (BHU) Varanasi alumni. Outreach shares your name and batch only with people you message.
        </p>
      </div>
    </section>
  );
}

function CareerMentorshipPanel() {
  return (
    <section className="career-mentorship" id="mentorship" aria-labelledby="career-mentorship-title">
      <div className="career-mentorship__shell">
        <header className="career-hub__intro">
          <p className="career-hub__eyebrow">Guidance · Coffee chats</p>
          <h2 id="career-mentorship-title" className="career-hub__title">
            Mentorship starts with a respectful note
          </h2>
          <p className="career-hub__lede">
            We don’t run marketplace matching yet—use Referrals or Messages with a clear ask. Alumni who mentor usually hint at it on their
            profiles.
          </p>
        </header>
        <div className="career-mentorship__grid">
          <article className="career-hub__panel ds-surface-card">
            <h3 className="career-hub__panel-title">How to ask</h3>
            <ol className="career-mentorship__steps">
              <li>Pick someone whose path overlaps yours—company, role, or city.</li>
              <li>From Referrals, explain what you need (one call vs ongoing advice).</li>
              <li>Offer times or ask if they prefer written guidance.</li>
            </ol>
            <Link to={careerPageReferralsHref()} className="btn btn--secondary">
              Open Referrals
            </Link>
          </article>
          <article className="career-hub__panel ds-surface-card">
            <h3 className="career-hub__panel-title">Offer mentorship</h3>
            <p className="career-hub__panel-copy">
              Mention openness on your profile and reply when juniors reach out. Hiring managers can highlight informational chats inside hiring
              posts as we wire more surfaces.
            </p>
            <Link to="/search" className="career-hub__secondary-link">
              Discover profiles to support →
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}

function navDisplayName(profile: { fullName?: string | null } | undefined, email: string | undefined): string {
  const fn = demoDisplayFullName(profile?.fullName).trim() || profile?.fullName?.trim();
  if (fn) {
    const parts = fn.split(/\s+/);
    return parts[0] ?? fn;
  }
  return displayFirstNameFromEmail(email);
}

export function CareerPage() {
  const auth = useAuth();
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [city, setCity] = useState("");
  const [sortBy, setSortBy] = useState<ReferralSort>("most_relevant");
  const [committed, setCommitted] = useState({ company: "", role: "", city: "" });
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [requestModalRow, setRequestModalRow] = useState<CareerBestMatchRow | null>(null);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestSending, setRequestSending] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [preferencesEditing, setPreferencesEditing] = useState(false);
  const preferencesEditingRef = useRef<HTMLDivElement>(null);
  const preferenceFocusFieldRef = useRef<"company" | "role" | "city" | null>(null);
  const hiringFlowRef = useRef<PostRoleHiringFlowHandle>(null);
  const [hiringNotice, setHiringNotice] = useState<string | null>(null);
  const searchQuery = useInfiniteQuery({
    queryKey: queryKeys.directory.searchInfinite(
      null,
      "",
      committed.company,
      "",
      "",
      committed.city,
      committed.role
    ),
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      if (committed.company) params.set("company", committed.company);
      if (committed.role) params.set("q", committed.role);
      if (committed.city) params.set("residenceCity", committed.city);
      params.set("limit", "20");
      if (pageParam) params.set("cursor", pageParam);
      return assertApiGet<SearchResult>(`/v1/search?${params.toString()}`, signal);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor ?? undefined,
    enabled: auth.status === "authenticated",
    ...DIRECTORY_INFINITE_QUERY_OPTIONS,
  });

  const rows = useMemo(() => {
    const results = searchQuery.data?.pages.flatMap((page) => page.results) ?? [];
    const normalized: ReferralRow[] = results.map((profile) => {
      const org = profile.headlineOrganizationName?.trim() ?? "";
      const title = profile.headlineRoleTitle?.trim() ?? "Alumni professional";
      const matchesCompany = Boolean(committed.company) && org.toLowerCase().includes(committed.company.toLowerCase());
      const matchesRole = Boolean(committed.role) && title.toLowerCase().includes(committed.role.toLowerCase());
      const codeRaw = profile.departmentCode;
      const departmentCode = codeRaw?.trim() ? codeRaw.toUpperCase() : null;
      const batchRaw = profile.batchYear;
      const batchYear =
        typeof batchRaw === "number" && Number.isFinite(batchRaw) ? Math.trunc(batchRaw as number) : null;
      const alumniScore =
        Number(Boolean(departmentCode)) + Number(Boolean(batchYear)) + Number(matchesCompany) + Number(matchesRole);
      const referralContextNote = "";
      const profileComplete = Boolean(departmentCode && batchYear);

      return {
        id: profile.id,
        name: demoDisplayFullName(profile.fullName) || profile.fullName.trim(),
        titleLine: org ? `${title} @ ${org}` : title,
        locationLine: profile.residenceCity || profile.residenceCountry || "Location unknown",
        departmentCode,
        batchYear,
        referralContextNote,
        chips: [matchesCompany ? "Same company" : null, matchesRole ? "Same role" : null].filter(Boolean) as string[],
        alumniScore,
        bio: profile.bio,
        profileComplete,
      };
    });
    const strictRole = committed.role.trim().toLowerCase();
    const strictlyFiltered = strictRole
      ? normalized.filter((row) => row.titleLine.toLowerCase().includes(strictRole))
      : normalized;
    if (sortBy === "alumni_match") {
      return [...strictlyFiltered].sort((a, b) => b.alumniScore - a.alumniScore);
    }
    return strictlyFiltered;
  }, [searchQuery.data, committed.company, committed.role, sortBy]);

  function focusPreferenceField(field: "company" | "role" | "city") {
    const inputId =
      field === "company" ? "career-edit-company" : field === "role" ? "career-edit-role" : "career-edit-city";
    preferencesEditingRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    window.requestAnimationFrame(() => {
      document.getElementById(inputId)?.focus();
    });
  }

  useEffect(() => {
    if (!preferencesEditing) return;
    preferencesEditingRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const field = preferenceFocusFieldRef.current;
    preferenceFocusFieldRef.current = null;
    if (!field) return;
    const inputId =
      field === "company" ? "career-edit-company" : field === "role" ? "career-edit-role" : "career-edit-city";
    window.requestAnimationFrame(() => {
      document.getElementById(inputId)?.focus();
    });
  }, [preferencesEditing]);

  function openMessagingDraft(row: CareerBestMatchRow) {
    const firstName = row.name.trim().split(/\s+/)[0] ?? "there";
    window.dispatchEvent(
      new CustomEvent("messaging:open-draft", {
        detail: {
          recipientPersonId: row.id,
          recipientName: row.name,
          initialMessage: `Hi ${firstName},\n`,
          kind: "referral",
        },
      })
    );
  }

  const openRequestModal = (row: CareerBestMatchRow) => {
    setActionError(null);
    setActionNotice(null);
    setRequestError(null);
    const firstName = row.name.trim().split(/\s+/)[0] ?? "there";
    const rolePart = committed.role.trim() ? `${committed.role.trim()} roles` : "roles";
    const companyPart = committed.company.trim() ? ` at ${committed.company.trim()}` : "";
    setRequestMessage(
      `Hi ${firstName},\n\nI am applying for ${rolePart}${companyPart} and came across your profile.\n\nWould appreciate it if you could refer me.\n\nThanks in advance!`
    );
    setRequestModalRow(row);
  };

  const closeRequestModal = () => {
    setRequestModalRow(null);
    setRequestError(null);
    setRequestMessage("");
  };

  const sendRequest = async () => {
    if (!requestModalRow || !requestMessage.trim() || requestSending) return;
    setRequestSending(true);
    setRequestError(null);
    const { data, error } = await api.post<CreateConnectionThreadResponse>("/v1/connection-threads", {
      recipientPersonId: requestModalRow.id,
      initialMessage: requestMessage.trim(),
      kind: "referral",
    });
    setRequestSending(false);
    if (error || !data?.threadId) {
      setRequestError(error?.message ?? error?.code ?? "Could not send request.");
      return;
    }
    setActionNotice("Referral request sent.");
    closeRequestModal();
  };

  if (auth.status !== "authenticated") {
    return null;
  }

  const displayName =
    demoDisplayFullName(auth.myProfile?.fullName).trim() ||
    auth.myProfile?.fullName?.trim() ||
    navDisplayName(auth.myProfile ?? undefined, auth.person.institutionalEmail);
  const hasCommittedSearch = Boolean(committed.company || committed.role || committed.city);

  function openPreferenceEditor(field?: "company" | "role" | "city") {
    setCompany(committed.company);
    setRole(committed.role);
    setCity(committed.city);
    if (preferencesEditing && field) {
      focusPreferenceField(field);
      return;
    }
    preferenceFocusFieldRef.current = field ?? null;
    setPreferencesEditing(true);
  }

  function cancelPreferenceEdit() {
    setCompany(committed.company);
    setRole(committed.role);
    setCity(committed.city);
    setPreferencesEditing(false);
  }

  function applyPreferenceUpdates() {
    setCommitted({
      company: company.trim(),
      role: role.trim(),
      city: city.trim(),
    });
    setPreferencesEditing(false);
  }

  function clearAllCommittedFilters() {
    setCompany("");
    setRole("");
    setCity("");
    setCommitted({ company: "", role: "", city: "" });
    setPreferencesEditing(false);
  }

  const matchingRole = committed.role.trim() || "—";
  const matchingCompanies = committed.company.trim() || "—";
  const matchingLocation = committed.city.trim() || "—";

  const featuredRows = hasCommittedSearch && rows.length > 0 ? rows.slice(0, 3) : [];
  const featuredIds = new Set(featuredRows.map((r) => r.id));
  const listRows = hasCommittedSearch && featuredRows.length > 0 ? rows.filter((r) => !featuredIds.has(r.id)) : rows;

  return (
    <div className="intent-page-shell career-page-shell">
      <Nav
        variant="home"
        avatarName={displayName}
        appToolbarNoBorder
        appToolbarLead={
          <div className="nav-app-toolbar__welcome">
            <h1 id="career-toolbar-title" className="nav-app-toolbar__welcome-title">
              Careers
            </h1>
          </div>
        }
      />
      <CareerOpportunitiesHub
        onPostRole={() => hiringFlowRef.current?.open()}
        hiringNotice={hiringNotice}
        onDismissNotice={() => setHiringNotice(null)}
      />
      <div id="referrals" className="career-referrals-v3 career-referrals-v3--lux">
        <div className="career-referrals-v3__shell">
          {hasCommittedSearch ? (
            <>
              <div className="career-referrals-v3__matching-bezel career-referrals-v3__matching-bezel--shell-top">
                <section className="career-referrals-v3__matching-card" aria-labelledby="career-matching-label">
                  <div className="career-referrals-v3__matching-toolbar">
                    <p id="career-matching-label" className="career-referrals-v3__matching-label">
                      Matching based on
                    </p>
                    <div className="career-referrals-v3__matching-actions">
                      <button type="button" className="career-referrals-v3__matching-clear-all" onClick={clearAllCommittedFilters}>
                        Clear all
                      </button>
                      <button type="button" className="career-referrals-v3__edit-prefs-btn" onClick={() => openPreferenceEditor()}>
                        <IconPencil />
                        <span>Edit preferences</span>
                      </button>
                    </div>
                  </div>
                  <div className="career-referrals-v3__matching-pills">
                    <button
                      type="button"
                      className="career-referrals-v3__matching-pill career-referrals-v3__matching-pill--editable"
                      onClick={() => openPreferenceEditor("role")}
                      aria-label={`Edit role filter: ${matchingRole}`}
                    >
                      <span className="career-referrals-v3__matching-pill-icon career-referrals-v3__matching-pill-icon--role">
                        <IconBriefcase />
                      </span>
                      <div className="career-referrals-v3__matching-pill-text">
                        <span className="career-referrals-v3__matching-pill-label">Role</span>
                        <span className="career-referrals-v3__matching-pill-value">{matchingRole}</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="career-referrals-v3__matching-pill career-referrals-v3__matching-pill--editable"
                      onClick={() => openPreferenceEditor("company")}
                      aria-label={`Edit target companies filter: ${matchingCompanies}`}
                    >
                      <span className="career-referrals-v3__matching-pill-icon career-referrals-v3__matching-pill-icon--company">
                        <IconBuilding />
                      </span>
                      <div className="career-referrals-v3__matching-pill-text">
                        <span className="career-referrals-v3__matching-pill-label">Target companies</span>
                        <span className="career-referrals-v3__matching-pill-value">{matchingCompanies}</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="career-referrals-v3__matching-pill career-referrals-v3__matching-pill--editable"
                      onClick={() => openPreferenceEditor("city")}
                      aria-label={`Edit location filter: ${matchingLocation}`}
                    >
                      <span className="career-referrals-v3__matching-pill-icon career-referrals-v3__matching-pill-icon--location">
                        <IconMapPin />
                      </span>
                      <div className="career-referrals-v3__matching-pill-text">
                        <span className="career-referrals-v3__matching-pill-label">Location</span>
                        <span className="career-referrals-v3__matching-pill-value">{matchingLocation}</span>
                      </div>
                    </button>
                  </div>
                </section>
              </div>

              {preferencesEditing ? (
                <section
                  ref={preferencesEditingRef}
                  className="career-referrals-v3__filters career-referrals-v3__filters--lux career-referrals-v3__filters--edit ds-surface-card"
                  aria-label="Edit referral preferences"
                >
                  <div className="career-referrals-v3__field">
                    <label htmlFor="career-edit-company">Company</label>
                    <input
                      id="career-edit-company"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="Company name"
                    />
                  </div>
                  <div className="career-referrals-v3__field">
                    <label htmlFor="career-edit-role">Role</label>
                    <input id="career-edit-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role title" />
                  </div>
                  <div className="career-referrals-v3__field">
                    <label htmlFor="career-edit-city">Location</label>
                    <input id="career-edit-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
                  </div>
                  <Button type="button" variant="primary" onClick={applyPreferenceUpdates}>
                    Apply updates
                  </Button>
                  <Button type="button" variant="secondary" onClick={cancelPreferenceEdit}>
                    Cancel
                  </Button>
                </section>
              ) : null}

              {featuredRows.length > 0 ? (
                <CareerBestMatches
                  rows={featuredRows}
                  committed={committed}
                  onRequestReferral={openRequestModal}
                  openMessagingDraft={openMessagingDraft}
                />
              ) : null}

              <section className="career-referrals-v3__directory" aria-labelledby="career-directory-title">
                <div className="career-referrals-v3__result-head career-referrals-v3__result-head--directory">
                  <p id="career-directory-title" className="career-referrals-v3__directory-summary">
                    {searchQuery.isFetching && rows.length === 0 ? (
                      <>
                        <Spinner size="sm" /> Searching…
                      </>
                    ) : (
                      <>
                        <span className="career-referrals-v3__directory-summary-strong">{rows.length} alumni</span>
                        {listRows.length > 0 ? (
                          <span className="career-referrals-v3__directory-summary-muted">
                            {" "}
                            · {listRows.length} beyond top picks
                          </span>
                        ) : rows.length > 0 ? (
                          <span className="career-referrals-v3__directory-summary-muted"> · All shown above</span>
                        ) : null}
                      </>
                    )}
                  </p>
                  <label className="career-referrals-v3__sort">
                    Sort by:
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value as ReferralSort)}>
                      <option value="most_relevant">Most relevant</option>
                      <option value="alumni_match">Alumni match</option>
                    </select>
                  </label>
                </div>

                {actionNotice ? <p className="career-referrals-v3__notice">{actionNotice}</p> : null}
                {actionError ? <p className="career-referrals-v3__error">{actionError}</p> : null}

                <div className="career-referrals-v3__list">
                  {listRows.length === 0 ? (
                    <p className="career-referrals-v3__directory-empty">
                      {rows.length === 0
                        ? "No alumni for these filters yet."
                        : "Everyone in this result set is highlighted in Best matches."}
                    </p>
                  ) : null}
                  {listRows.map((row, index) => (
                    <article key={row.id} className="career-referrals-v3__row">
                      <div className="career-referrals-v3__identity">
                        <Avatar name={row.name} size="lg" tone="pastel" />
                        <div>
                          <p className="career-referrals-v3__name">
                            {row.name}{" "}
                            {hasCommittedSearch &&
                            sortBy === "most_relevant" &&
                            featuredRows.length === 0 &&
                            index === 0 ? (
                              <span className="career-referrals-v3__relevance-tag ds-chip ds-chip--active">Most relevant</span>
                            ) : null}
                          </p>
                          <p className="career-referrals-v3__line">{row.titleLine}</p>
                          <div className="career-referrals-v3__meta-row">
                            <span className="career-referrals-v3__meta-pill">{row.locationLine}</span>
                            <span className="career-referrals-v3__meta-pill">
                              {row.departmentCode || row.batchYear != null ? (
                                <DeptBatchMeta
                                  className="dept-batch-meta"
                                  departmentCode={row.departmentCode}
                                  batchYear={row.batchYear}
                                />
                              ) : (
                                "IIT (BHU) alumni"
                              )}
                            </span>
                          </div>
                          <div className="career-referrals-v3__chips">
                            {row.chips.map((chip) => (
                              <span key={chip} className="ds-chip ds-chip--active">
                                {chip}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      {row.referralContextNote ? (
                        <div className="career-referrals-v3__trust">
                          <p className="career-referrals-v3__trust-head">{row.referralContextNote}</p>
                        </div>
                      ) : null}
                      <div className="career-referrals-v3__actions ds-action-row">
                        <Button
                          type="button"
                          variant="secondary"
                          className="career-referrals-v3__message-btn"
                          onClick={() => openRequestModal(row)}
                        >
                          Request Referral
                        </Button>
                        <Link to={`/profiles/${row.id}`} className="career-referrals-v3__view-link">
                          View profile →
                        </Link>
                      </div>
                    </article>
                  ))}
                  {listRows.length > 0 && searchQuery.hasNextPage ? (
                    <div className="career-referrals-v3__more">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void searchQuery.fetchNextPage()}
                        disabled={searchQuery.isFetchingNextPage}
                      >
                        {searchQuery.isFetchingNextPage ? "Loading…" : "Load more"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </section>

              <footer className="career-referrals-v3__footer">
                <div>
                  <p className="career-referrals-v3__footer-title">Your request is private</p>
                  <p className="career-referrals-v3__footer-copy">
                    Alumni will only see your name, batch, and a brief message.
                  </p>
                </div>
                <span className="career-referrals-v3__footer-link">Learn more about referrals →</span>
              </footer>
            </>
          ) : (
            <>
              <section
                className="career-referrals-v3__filters career-referrals-v3__filters--lux career-referrals-v3__filters--shell-intro ds-surface-card"
                aria-label="Referral preference filters"
              >
                <div className="career-referrals-v3__field">
                  <label htmlFor="career-company">Company</label>
                  <input id="career-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" />
                </div>
                <div className="career-referrals-v3__field">
                  <label htmlFor="career-role">Role</label>
                  <input id="career-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role title" />
                </div>
                <div className="career-referrals-v3__field">
                  <label htmlFor="career-city">Location</label>
                  <input id="career-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
                </div>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() =>
                    setCommitted({
                      company: company.trim(),
                      role: role.trim(),
                      city: city.trim(),
                    })
                  }
                >
                  Find alumni
                </Button>
              </section>
            </>
          )}

          {!hasCommittedSearch ? (
            <>
              <div className="career-referrals-v3__result-head">
                <p className="career-referrals-v3__result-count">
                  {searchQuery.isFetching && rows.length === 0 ? (
                    <>
                      <Spinner size="sm" /> Searching…
                    </>
                  ) : (
                    `${rows.length} alumni found`
                  )}
                </p>
                <label className="career-referrals-v3__sort">
                  Sort by:
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value as ReferralSort)}>
                    <option value="most_relevant">Most relevant</option>
                    <option value="alumni_match">Alumni match</option>
                  </select>
                </label>
              </div>

              {actionNotice ? <p className="career-referrals-v3__notice">{actionNotice}</p> : null}
              {actionError ? <p className="career-referrals-v3__error">{actionError}</p> : null}

              <div className="career-referrals-v3__list">
                {listRows.map((row, index) => (
                  <article key={row.id} className="career-referrals-v3__row">
                    <div className="career-referrals-v3__identity">
                      <Avatar name={row.name} size="lg" tone="pastel" />
                      <div>
                        <p className="career-referrals-v3__name">
                          {row.name}{" "}
                          {hasCommittedSearch &&
                          sortBy === "most_relevant" &&
                          featuredRows.length === 0 &&
                          index === 0 ? (
                            <span className="career-referrals-v3__relevance-tag ds-chip ds-chip--active">Most relevant</span>
                          ) : null}
                        </p>
                        <p className="career-referrals-v3__line">{row.titleLine}</p>
                        <div className="career-referrals-v3__meta-row">
                          <span className="career-referrals-v3__meta-pill">{row.locationLine}</span>
                          <span className="career-referrals-v3__meta-pill">
                              {row.departmentCode || row.batchYear != null ? (
                                <DeptBatchMeta
                                  className="dept-batch-meta"
                                  departmentCode={row.departmentCode}
                                  batchYear={row.batchYear}
                                />
                              ) : (
                                "IIT (BHU) alumni"
                              )}
                            </span>
                        </div>
                        <div className="career-referrals-v3__chips">
                          {row.chips.map((chip) => (
                            <span key={chip} className="ds-chip ds-chip--active">
                              {chip}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {row.referralContextNote ? (
                      <div className="career-referrals-v3__trust">
                        <p className="career-referrals-v3__trust-head">{row.referralContextNote}</p>
                      </div>
                    ) : null}
                    <div className="career-referrals-v3__actions ds-action-row">
                      <Button
                        type="button"
                        variant="secondary"
                        className="career-referrals-v3__message-btn"
                        onClick={() => openRequestModal(row)}
                      >
                        Request Referral
                      </Button>
                      <Link to={`/profiles/${row.id}`} className="career-referrals-v3__view-link">
                        View profile →
                      </Link>
                    </div>
                  </article>
                ))}
                {searchQuery.hasNextPage ? (
                  <div className="career-referrals-v3__more">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void searchQuery.fetchNextPage()}
                      disabled={searchQuery.isFetchingNextPage}
                    >
                      {searchQuery.isFetchingNextPage ? "Loading…" : "Load more"}
                    </Button>
                  </div>
                ) : null}
              </div>

              <footer className="career-referrals-v3__footer">
                <div>
                  <p className="career-referrals-v3__footer-title">Your request is private</p>
                  <p className="career-referrals-v3__footer-copy">
                    Alumni will only see your name, batch, and a brief message.
                  </p>
                </div>
                <span className="career-referrals-v3__footer-link">Learn more about referrals →</span>
              </footer>
            </>
          ) : null}
        </div>
      </div>
      <CareerMentorshipPanel />
      <PostRoleHiringFlow ref={hiringFlowRef} onPublishSuccessNotice={setHiringNotice} />
      {requestModalRow ? (
        <div className="career-referrals-request__overlay" role="presentation" onClick={closeRequestModal}>
          <section
            className="career-referrals-request__dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Request referral from ${requestModalRow.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="career-referrals-request__head">
              <h2>Request referral from {requestModalRow.name}</h2>
              <button type="button" className="career-referrals-request__close" onClick={closeRequestModal}>
                ×
              </button>
            </header>
            <div className="career-referrals-request__profile">
              <Avatar name={requestModalRow.name} size="lg" tone="pastel" />
              <div>
                <p className="career-referrals-request__name">{requestModalRow.name}</p>
                <p className="career-referrals-request__meta">{requestModalRow.titleLine}</p>
                <p className="career-referrals-request__meta">⌖ {requestModalRow.locationLine}</p>
              </div>
            </div>
            <div className="career-referrals-request__reasons">
              <span>You&apos;re reaching out because:</span>
              <span>✓ {committed.company.trim() ? `Works at ${committed.company.trim()}` : "Shared alumni network"}</span>
              <span>✓ {committed.role.trim() ? `${committed.role.trim()} role` : "Relevant role fit"}</span>
            </div>
            <label className="career-referrals-request__field">
              <span>Your message</span>
              <textarea
                className="input input--textarea"
                rows={8}
                maxLength={500}
                value={requestMessage}
                onChange={(event) => setRequestMessage(event.target.value)}
              />
              <small>{requestMessage.length} / 500</small>
            </label>
            <div className="career-referrals-request__upload">
              <div>
                <p>Attach resume (optional)</p>
                <small>PDF up to 5MB</small>
              </div>
              <Button type="button" variant="primary">
                Upload
              </Button>
            </div>
            {requestError ? <p className="career-referrals-request__error">{requestError}</p> : null}
            <footer className="career-referrals-request__actions">
              <Button type="button" variant="primary" onClick={closeRequestModal}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void sendRequest()}
                disabled={requestSending || !requestMessage.trim()}
              >
                {requestSending ? "Sending…" : "Send request"}
              </Button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
