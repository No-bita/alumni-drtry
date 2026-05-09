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
import type { SearchResult } from "../api/client";
import { careerPageReferralsHref } from "../constants/careerTabs";
import { DIRECTORY_INFINITE_QUERY_OPTIONS } from "../constants/directorySearch";
import { useAuth } from "../contexts/AuthContext";
import { assertApiGet } from "../lib/assertApiGet";
import { demoDisplayFullName } from "../lib/demoProfile";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";
import { queryKeys } from "../lib/queryKeys";

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

function CareerOpportunitiesHub({
  onPostRole,
  onFindReferrals,
  hiringNotice,
  onDismissNotice,
}: {
  onPostRole: () => void;
  onFindReferrals: () => void;
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
        <header className="career-hub__intro" />
        <div className="career-hub__grid">
          <button
            type="button"
            className="career-hub__panel career-hub__panel--clickable ds-surface-card career-hub__panel--hire"
            onClick={onPostRole}
          >
            <p className="career-hub__panel-eyebrow">For your team</p>
            <h3 className="career-hub__panel-title">Hire Alumni</h3>
          </button>
          <Link
            to={careerPageReferralsHref()}
            className="career-hub__panel career-hub__panel--clickable ds-surface-card career-hub__panel--seek"
            onClick={(event) => {
              event.preventDefault();
              onFindReferrals();
            }}
          >
            <p className="career-hub__panel-eyebrow">For your next move</p>
            <h3 className="career-hub__panel-title">Find Referrals</h3>
          </Link>
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
  const [referralIntroNudging, setReferralIntroNudging] = useState(false);
  const referralIntroNudgeTimeoutRef = useRef<number | null>(null);
  const hiringFlowRef = useRef<PostRoleHiringFlowHandle>(null);
  const [hiringNotice, setHiringNotice] = useState<string | null>(null);
  const hasCommittedSearch = Boolean(committed.company || committed.role || committed.city);
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
    enabled: auth.status === "authenticated" && hasCommittedSearch,
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

  useEffect(() => {
    return () => {
      if (referralIntroNudgeTimeoutRef.current != null) {
        window.clearTimeout(referralIntroNudgeTimeoutRef.current);
      }
    };
  }, []);

  function openMessagingDraft(row: CareerBestMatchRow) {
    window.dispatchEvent(
      new CustomEvent("messaging:open-draft", {
        detail: {
          recipientPersonId: row.id,
          recipientName: row.name,
          initialMessage: "",
          kind: "referral",
        },
      })
    );
  }

  const openRequestModal = (row: CareerBestMatchRow) => {
    const firstName = row.name.trim().split(/\s+/)[0] ?? "there";
    const rolePart = committed.role.trim() ? `${committed.role.trim()} roles` : "roles";
    const companyPart = committed.company.trim() ? ` at ${committed.company.trim()}` : "";
    const initialMessage = `Hi ${firstName},\n\nI am applying for ${rolePart}${companyPart} and came across your profile.\n\nWould appreciate it if you could refer me.\n\nThanks in advance!`;
    window.dispatchEvent(
      new CustomEvent("messaging:open-draft", {
        detail: {
          recipientPersonId: row.id,
          recipientName: row.name,
          initialMessage,
          kind: "referral",
          requestTitle: `Request referral from ${row.name}`,
        },
      })
    );
  };

  if (auth.status !== "authenticated") {
    return null;
  }

  const displayName =
    demoDisplayFullName(auth.myProfile?.fullName).trim() ||
    auth.myProfile?.fullName?.trim() ||
    navDisplayName(auth.myProfile ?? undefined, auth.person.institutionalEmail);

  function nudgeReferralsIntroAndFocusCompany() {
    setReferralIntroNudging(true);
    if (referralIntroNudgeTimeoutRef.current != null) {
      window.clearTimeout(referralIntroNudgeTimeoutRef.current);
    }
    referralIntroNudgeTimeoutRef.current = window.setTimeout(() => {
      setReferralIntroNudging(false);
      referralIntroNudgeTimeoutRef.current = null;
    }, 720);
    window.setTimeout(() => {
      document.getElementById("career-company")?.focus();
    }, 90);
  }

  function handleFindReferralsCardClick() {
    document.getElementById("referrals")?.scrollIntoView({ behavior: "smooth", block: "start" });
    nudgeReferralsIntroAndFocusCompany();
    window.setTimeout(() => {
      document.getElementById("career-company")?.focus();
    }, hasCommittedSearch ? 40 : 90);
  }

  function clearReferralFilters() {
    setCompany("");
    setRole("");
    setCity("");
    setCommitted({ company: "", role: "", city: "" });
    window.setTimeout(() => {
      document.getElementById("career-company")?.focus();
    }, 40);
  }

  const featuredRows = hasCommittedSearch && rows.length > 0 ? rows.slice(0, 3) : [];
  const featuredIds = new Set(featuredRows.map((r) => r.id));
  const listRows = hasCommittedSearch && featuredRows.length > 0 ? rows.filter((r) => !featuredIds.has(r.id)) : rows;
  const showDirectoryList = listRows.length > 0 || (rows.length === 0 && !searchQuery.isFetching);

  return (
    <div className="intent-page-shell career-page-shell">
      <Nav
        variant="home"
        avatarName={displayName}
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
        onFindReferrals={handleFindReferralsCardClick}
        hiringNotice={hiringNotice}
        onDismissNotice={() => setHiringNotice(null)}
      />
      <div id="referrals" className="career-referrals-v3 career-referrals-v3--lux">
        <div className="career-referrals-v3__shell">
          <section
            className={`career-referrals-v3__filters career-referrals-v3__filters--lux career-referrals-v3__filters--shell-intro ds-surface-card${referralIntroNudging ? " career-referrals-v3__filters--attention" : ""}`}
            aria-label="Referral preference filters"
          >
            <div className="career-referrals-v3__field">
              <label htmlFor="career-company">Company</label>
              <div className="career-referrals-v3__field-input-wrap">
                <input id="career-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" />
                {company ? (
                  <button
                    type="button"
                    className="career-referrals-v3__field-clear"
                    aria-label="Clear company"
                    onClick={() => setCompany("")}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>
            <div className="career-referrals-v3__field">
              <label htmlFor="career-role">Role</label>
              <div className="career-referrals-v3__field-input-wrap">
                <input id="career-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role title" />
                {role ? (
                  <button
                    type="button"
                    className="career-referrals-v3__field-clear"
                    aria-label="Clear role"
                    onClick={() => setRole("")}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>
            <div className="career-referrals-v3__field">
              <label htmlFor="career-city">Location</label>
              <div className="career-referrals-v3__field-input-wrap">
                <input id="career-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
                {city ? (
                  <button
                    type="button"
                    className="career-referrals-v3__field-clear"
                    aria-label="Clear location"
                    onClick={() => setCity("")}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>
            <div className="career-referrals-v3__filter-actions">
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
              <button type="button" className="career-referrals-v3__clear-link" onClick={clearReferralFilters}>
                Clear
              </button>
            </div>
          </section>

          {hasCommittedSearch ? (
            <>
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
                  </select>
                </label>
              </div>

              {featuredRows.length > 0 ? (
                <CareerBestMatches
                  rows={featuredRows}
                  committed={committed}
                  onRequestReferral={openRequestModal}
                  openMessagingDraft={openMessagingDraft}
                />
              ) : null}

              {showDirectoryList ? (
                <section className="career-referrals-v3__directory" aria-labelledby="career-directory-title">
                  <div className="career-referrals-v3__list">
                    {listRows.length === 0 && rows.length === 0 && !searchQuery.isFetching ? (
                      <p className="career-referrals-v3__directory-empty">
                        No alumni for these filters yet.
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
              ) : null}
            </>
          ) : null}

          {!hasCommittedSearch ? (
            <section className="career-referrals-v3__directory" aria-label="Referral search prompt">
              <p className="career-referrals-v3__directory-empty">
                Set your company, role, or city in the bar above and click <strong>Find alumni</strong> to view
                ranked matches.
              </p>
            </section>
          ) : null}
        </div>
      </div>
      <PostRoleHiringFlow ref={hiringFlowRef} onPublishSuccessNotice={setHiringNotice} />
    </div>
  );
}
