import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { DirectorySearchBar } from "../components/DirectorySearchBar";
import { DirectoryFilterDrawer } from "../components/DirectoryFilterDrawer";
import { DirectoryFiltersForm } from "../components/DirectoryFiltersForm";
import { SearchResultRow } from "../components/SearchResultRow";
import { Spinner } from "../components/Spinner";
import {
  BulletinPanel,
  type BulletinFeedMeta,
  type BulletinPanelHandle,
} from "../components/BulletinPanel";
import {
  api,
  type ConnectionThreadDetailResponse,
  type CreateConnectionThreadResponse,
  type SearchResult,
} from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { assertApiGet } from "../lib/assertApiGet";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";
import { invalidateConnectionThreadQueries } from "../lib/invalidateAppQueries";
import { queryKeys } from "../lib/queryKeys";
import { careerIntentPath, isCareerTabSegment } from "../constants/careerTabs";
import { DIRECTORY_INFINITE_QUERY_OPTIONS } from "../constants/directorySearch";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useDialogFocusManager } from "../hooks/useDialogFocusManager";

function navDisplayName(profile: { fullName?: string | null } | undefined, email: string | undefined): string {
  const fn = profile?.fullName?.trim();
  if (fn) {
    const parts = fn.split(/\s+/);
    return parts[0] ?? fn;
  }
  return displayFirstNameFromEmail(email);
}

function openRolesHeadline(meta: BulletinFeedMeta): string {
  if (meta.status === "loading") return "Loading openings…";
  if (meta.status === "error") return "Couldn’t load openings";
  if (meta.loadedCount === 0) return "No open roles right now";
  if (meta.mayHaveMore) return `${meta.loadedCount}+ open roles`;
  return meta.loadedCount === 1 ? "1 open role" : `${meta.loadedCount} open roles`;
}

const REFERRAL_SEARCH_PRESETS = [
  { id: "software", label: "Software roles", query: "software engineer backend systems" },
  { id: "product", label: "Product roles", query: "product manager strategy growth" },
  { id: "finance", label: "Finance roles", query: "finance analyst investment operations" },
] as const;

const REFERRAL_TEMPLATES = [
  "Hi {firstName}, I am exploring opportunities and would value your advice on referrals at your company.",
  "Hi {firstName}, I noticed your experience and wanted to ask if we can connect for a referral conversation.",
  "Hi {firstName}, I am applying for a role aligned with your team and would appreciate your guidance.",
] as const;

const MENTORSHIP_WORKFLOW = ["not_started", "requested", "accepted", "scheduled", "completed"] as const;
type MentorshipStatus = (typeof MENTORSHIP_WORKFLOW)[number];

const REFERRAL_LIFECYCLE = ["initiated", "responded", "taken_offline", "closed"] as const;
type ReferralLifecycleStatus = (typeof REFERRAL_LIFECYCLE)[number];

const REFERRAL_STATUS_LABELS: Record<ReferralLifecycleStatus, string> = {
  initiated: "Initiated",
  responded: "Responded",
  taken_offline: "Taken offline",
  closed: "Closed",
};

type MentorProfile = {
  id: string;
  name: string;
  role: string;
  topics: string[];
  availability: string;
};

const MENTORSHIP_PROFILES: MentorProfile[] = [
  {
    id: "mentor-anuj-analytics",
    name: "Anuj Tripathi",
    role: "Staff Data Engineer · Seattle",
    topics: ["Data careers", "Interview prep", "Career transitions"],
    availability: "Wed / Sat, 30 min slots",
  },
  {
    id: "mentor-sneha-product",
    name: "Sneha Iyer",
    role: "Senior Product Lead · Bengaluru",
    topics: ["PM foundations", "Roadmapping", "Stakeholder communication"],
    availability: "Tue evenings, 45 min slots",
  },
  {
    id: "mentor-karthik-core",
    name: "Karthik Menon",
    role: "Engineering Manager · Mumbai",
    topics: ["Backend systems", "Leadership growth", "Resume review"],
    availability: "Fri mornings, 30 min slots",
  },
];

const MENTORSHIP_STATUS_LABELS: Record<MentorshipStatus, string> = {
  not_started: "Not started",
  requested: "Requested",
  accepted: "Accepted",
  scheduled: "Scheduled",
  completed: "Completed",
};

/** Career hub: unified referrals + opportunities workspace. */
export function CareerPage() {
  const auth = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { careerTab: careerTabParam } = useParams<{ careerTab: string }>();
  const bulletinRef = useRef<BulletinPanelHandle>(null);
  const referralPrefillDoneRef = useRef(false);
  const [feedMeta, setFeedMeta] = useState<BulletinFeedMeta>({
    status: "loading",
    loadedCount: 0,
    mayHaveMore: false,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [filterBatch, setFilterBatch] = useState<number | "">("");
  const [filterDept, setFilterDept] = useState("");
  const [filterCompany, setFilterCompany] = useState("");
  const [filterOcc, setFilterOcc] = useState("");
  const [filterResidenceCountry, setFilterResidenceCountry] = useState("");
  const [filterResidenceCity, setFilterResidenceCity] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [referralsCollapsed, setReferralsCollapsed] = useState(false);
  const [activeReferralThreadId, setActiveReferralThreadId] = useState<string | null>(null);
  const [activeReferralRecipient, setActiveReferralRecipient] = useState<{ id: string; name: string } | null>(null);
  const [referralChatMinimized, setReferralChatMinimized] = useState(false);
  const [referralComposer, setReferralComposer] = useState("");
  const [referralSending, setReferralSending] = useState(false);
  const [referralActionError, setReferralActionError] = useState<string | null>(null);
  const [referralStatusByRecipient, setReferralStatusByRecipient] = useState<Record<string, ReferralLifecycleStatus>>({});
  const [mentorshipStatusByMentor, setMentorshipStatusByMentor] = useState<Record<string, MentorshipStatus>>({});
  const [committedReferralSearch, setCommittedReferralSearch] = useState<{
    q: string;
    batch: number | "";
    dept: string;
    company: string;
    occ: string;
    residenceCountry: string;
    residenceCity: string;
  } | null>(null);
  const chatDialogRef = useRef<HTMLDivElement | null>(null);
  const chatOpen = (activeReferralRecipient || activeReferralThreadId) && !referralChatMinimized;
  const activeTab = isCareerTabSegment(careerTabParam) ? careerTabParam : "opportunities";

  const onFeedMetaChange = useCallback((m: BulletinFeedMeta) => {
    setFeedMeta((prev) =>
      prev.status === m.status && prev.loadedCount === m.loadedCount && prev.mayHaveMore === m.mayHaveMore
        ? prev
        : m
    );
  }, []);

  const feedReady = auth.status === "authenticated";

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    const myProfile = auth.myProfile;
    if (!myProfile || referralPrefillDoneRef.current) return;
    referralPrefillDoneRef.current = true;
    const p = myProfile;
    queueMicrotask(() => {
      if (p.batchYear != null) setFilterBatch(p.batchYear);
      const dc = p.departmentCode ?? p.parsedDepartmentCode;
      if (dc) setFilterDept(dc.toLowerCase());
    });
  }, [auth]);

  useEffect(() => {
    if (searchParams.get("compose") !== "1") return;
    bulletinRef.current?.openCompose();
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("compose");
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  const commitReferralSearch = useCallback(() => {
    setCommittedReferralSearch({
      q: searchQuery.trim(),
      batch: filterBatch,
      dept: filterDept,
      company: filterCompany.trim(),
      occ: filterOcc,
      residenceCountry: filterResidenceCountry.trim(),
      residenceCity: filterResidenceCity.trim(),
    });
  }, [
    searchQuery,
    filterBatch,
    filterDept,
    filterCompany,
    filterOcc,
    filterResidenceCountry,
    filterResidenceCity,
  ]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    commitReferralSearch();
  };

  const referralHasCommittedSearch = committedReferralSearch != null;
  const referralSearchQuery = useInfiniteQuery({
    queryKey: queryKeys.directory.searchInfinite(
      committedReferralSearch?.batch === "" ? null : (committedReferralSearch?.batch ?? null),
      committedReferralSearch?.dept ?? "",
      committedReferralSearch?.company ?? "",
      committedReferralSearch?.occ ?? "",
      committedReferralSearch?.residenceCountry ?? "",
      committedReferralSearch?.residenceCity ?? "",
      committedReferralSearch?.q ?? ""
    ),
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      const committed = committedReferralSearch;
      if (committed?.batch !== "") params.set("batch", String(committed?.batch));
      if (committed?.dept) params.set("dept", committed.dept);
      if (committed?.company) params.set("company", committed.company);
      if (committed?.occ) params.set("occ", committed.occ);
      if (committed?.residenceCountry) params.set("residenceCountry", committed.residenceCountry);
      if (committed?.residenceCity) params.set("residenceCity", committed.residenceCity);
      if (committed?.q) params.set("q", committed.q);
      params.set("limit", "20");
      if (pageParam) params.set("cursor", pageParam);
      return assertApiGet<SearchResult>(`/v1/search?${params.toString()}`, signal);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor ?? undefined,
    enabled: referralHasCommittedSearch,
    ...DIRECTORY_INFINITE_QUERY_OPTIONS,
  });
  const referralResults = useMemo(
    () => referralSearchQuery.data?.pages.flatMap((p) => p.results) ?? [],
    [referralSearchQuery.data]
  );
  const referralError =
    referralSearchQuery.error instanceof Error
      ? referralSearchQuery.error.message
      : referralSearchQuery.error
        ? String(referralSearchQuery.error)
        : null;
  const referralSessionId = referralSearchQuery.data?.pages[0]?.searchSessionId ?? null;
  const referralThreadQuery = useQuery({
    queryKey: queryKeys.connectionThreads.detail(activeReferralThreadId ?? ""),
    queryFn: ({ signal }) =>
      assertApiGet<ConnectionThreadDetailResponse>(`/v1/connection-threads/${activeReferralThreadId}`, signal),
    enabled: Boolean(activeReferralThreadId),
    retry: false,
  });
  const myPersonId = auth.status === "authenticated" ? auth.person.personId : null;
  const referralThreadDetail = referralThreadQuery.data ?? null;
  const hasActiveReferralThread = Boolean(activeReferralThreadId);

  const formatThreadTime = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const closeReferralChat = useCallback(() => {
    setActiveReferralThreadId(null);
    setActiveReferralRecipient(null);
    setReferralChatMinimized(false);
    setReferralComposer("");
    setReferralActionError(null);
  }, []);

  useBodyScrollLock(Boolean(chatOpen));
  useDialogFocusManager({
    open: Boolean(chatOpen),
    containerRef: chatDialogRef,
    onClose: closeReferralChat,
  });

  const sendReferralMessage = useCallback(async () => {
    const composed = referralComposer.trim();
    if (!activeReferralRecipient || !composed || referralSending) return;
    setReferralSending(true);
    setReferralActionError(null);
    if (!activeReferralThreadId) {
      const { data, error } = await api.post<CreateConnectionThreadResponse>("/v1/connection-threads", {
        recipientPersonId: activeReferralRecipient.id,
        initialMessage: composed,
        kind: "referral",
      });
      setReferralSending(false);
      if (error || !data?.threadId) {
        setReferralActionError(error?.message ?? error?.code ?? "Could not send message.");
        return;
      }
      setActiveReferralThreadId(data.threadId);
      setReferralComposer("");
      invalidateConnectionThreadQueries();
      void referralThreadQuery.refetch();
      return;
    }
    const { error } = await api.post(`/v1/connection-threads/${activeReferralThreadId}/messages`, {
      body: composed,
    });
    setReferralSending(false);
    if (error) {
      setReferralActionError(error.message ?? error.code ?? "Could not send message.");
      return;
    }
    setReferralComposer("");
    invalidateConnectionThreadQueries();
    void referralThreadQuery.refetch();
  }, [activeReferralRecipient, activeReferralThreadId, referralComposer, referralSending, referralThreadQuery]);

  const openReferralChat = useCallback(
    async (recipientPersonId: string, recipientName: string) => {
      const firstName = recipientName.trim().split(/\s+/)[0] ?? "there";
      const initialMessage = `Hi ${firstName}, I found your profile on the referrals tab and wanted to connect regarding a referral.`;
      setActiveReferralRecipient({ id: recipientPersonId, name: recipientName });
      setActiveReferralThreadId(null);
      setReferralChatMinimized(false);
      setReferralComposer(initialMessage);
      setReferralActionError(null);
      setReferralStatusByRecipient((prev) =>
        prev[recipientPersonId] ? prev : { ...prev, [recipientPersonId]: "initiated" }
      );
      return;
    },
    []
  );

  const referralFilterCount =
    (filterBatch !== "" ? 1 : 0) +
    (filterDept ? 1 : 0) +
    (filterCompany.trim() ? 1 : 0) +
    (filterOcc ? 1 : 0) +
    (filterResidenceCountry.trim() ? 1 : 0) +
    (filterResidenceCity.trim() ? 1 : 0);

  const referralHasActiveFilters =
    filterBatch !== "" ||
    !!filterDept ||
    !!filterCompany.trim() ||
    !!filterOcc ||
    !!filterResidenceCountry.trim() ||
    !!filterResidenceCity.trim() ||
    !!searchQuery.trim();

  const clearReferralFilters = () => {
    setSearchQuery("");
    setFilterBatch("");
    setFilterDept("");
    setFilterCompany("");
    setFilterOcc("");
    setFilterResidenceCountry("");
    setFilterResidenceCity("");
    setFiltersOpen(false);
    setCommittedReferralSearch(null);
  };

  const applyReferralPreset = useCallback((presetQuery: string) => {
    setSearchQuery(presetQuery);
    setCommittedReferralSearch((prev) => ({
      q: presetQuery,
      batch: prev?.batch ?? "",
      dept: prev?.dept ?? "",
      company: prev?.company ?? "",
      occ: prev?.occ ?? "",
      residenceCountry: prev?.residenceCountry ?? "",
      residenceCity: prev?.residenceCity ?? "",
    }));
  }, []);

  const activeReferralStatus = useMemo(() => {
    if (activeReferralRecipient) return referralStatusByRecipient[activeReferralRecipient.id] ?? "initiated";
    return null;
  }, [activeReferralRecipient, referralStatusByRecipient]);

  const setActiveReferralStatus = useCallback(
    (status: ReferralLifecycleStatus) => {
      if (!activeReferralRecipient) return;
      setReferralStatusByRecipient((prev) => ({ ...prev, [activeReferralRecipient.id]: status }));
    },
    [activeReferralRecipient]
  );

  const formatTemplate = (template: string, fullName: string): string => {
    const firstName = fullName.trim().split(/\s+/)[0] ?? "there";
    return template.replace("{firstName}", firstName);
  };

  const proofMetrics = useMemo(() => {
    const participants = new Set<string>();
    referralResults.forEach((profile) => participants.add(profile.id));
    Object.keys(referralStatusByRecipient).forEach((id) => participants.add(id));
    const departments = new Set<string>();
    referralResults.forEach((profile) => {
      const dept = profile.departmentCode ?? profile.parsedDepartmentCode;
      if (dept) departments.add(dept.toUpperCase());
    });
    const activeMentorshipRequests = Object.values(mentorshipStatusByMentor).filter(
      (status) => status !== "not_started"
    ).length;
    return [
      {
        label: "Open opportunities",
        value:
          feedMeta.status === "loading"
            ? "..."
            : feedMeta.mayHaveMore
              ? `${Math.max(feedMeta.loadedCount, 1)}+`
              : String(feedMeta.loadedCount),
      },
      { label: "Career participants (30d)", value: String(participants.size) },
      { label: "Referral conversations", value: String(Object.keys(referralStatusByRecipient).length) },
      { label: "Departments represented", value: String(departments.size) },
      { label: "Mentorship requests", value: String(activeMentorshipRequests) },
    ];
  }, [feedMeta, mentorshipStatusByMentor, referralResults, referralStatusByRecipient]);

  const mentorshipSummary = useMemo(() => {
    const statuses = Object.values(mentorshipStatusByMentor);
    return {
      requested: statuses.filter((s) => s === "requested").length,
      accepted: statuses.filter((s) => s === "accepted").length,
      scheduled: statuses.filter((s) => s === "scheduled").length,
      completed: statuses.filter((s) => s === "completed").length,
    };
  }, [mentorshipStatusByMentor]);

  const advanceMentorshipStatus = (mentorId: string) => {
    setMentorshipStatusByMentor((prev) => {
      const current = prev[mentorId] ?? "not_started";
      const index = MENTORSHIP_WORKFLOW.indexOf(current);
      const next = MENTORSHIP_WORKFLOW[Math.min(index + 1, MENTORSHIP_WORKFLOW.length - 1)];
      return { ...prev, [mentorId]: next };
    });
  };

  const displayName = useMemo(() => {
    if (auth.status !== "authenticated") return "";
    return (
      auth.myProfile?.fullName?.trim() ||
      navDisplayName(auth.myProfile ?? undefined, auth.person.institutionalEmail)
    );
  }, [auth]);

  if (auth.status !== "authenticated") {
    return null;
  }

  if (!isCareerTabSegment(careerTabParam)) {
    return <Navigate to={careerIntentPath("opportunities")} replace />;
  }

  return (
    <div className="intent-page-shell">
      <Nav variant="home" avatarName={displayName} />
      <div className="career-page">
        <header className="career-page__hero">
          <h1 className="career-page__hero-title">Hire. Refer. Grow.</h1>
          <p className="career-page__hero-subcopy">
            Alumni-first career momentum for graduates, with clear engagement proof for institutes and alumni offices.
          </p>
          <div className="career-page__tabs" role="tablist" aria-label="Career workflows">
            <Link
              to={careerIntentPath("opportunities")}
              className={`career-page__tab${activeTab === "opportunities" ? " career-page__tab--active" : ""}`}
              role="tab"
              aria-selected={activeTab === "opportunities"}
            >
              <span className="career-page__tab-kicker">Primary flow</span>
              <span className="career-page__tab-label">Opportunities</span>
              <span className="career-page__tab-desc">Post roles, review openings, and keep hiring active.</span>
            </Link>
            <Link
              to={careerIntentPath("referrals")}
              className={`career-page__tab${activeTab === "referrals" ? " career-page__tab--active" : ""}`}
              role="tab"
              aria-selected={activeTab === "referrals"}
            >
              <span className="career-page__tab-kicker">Conversion flow</span>
              <span className="career-page__tab-label">Referrals</span>
              <span className="career-page__tab-desc">Find relevant alumni and move asks from outreach to closure.</span>
            </Link>
            <Link
              to={careerIntentPath("mentorship")}
              className={`career-page__tab${activeTab === "mentorship" ? " career-page__tab--active" : ""}`}
              role="tab"
              aria-selected={activeTab === "mentorship"}
            >
              <span className="career-page__tab-kicker">Growth flow</span>
              <span className="career-page__tab-label">Mentorship</span>
              <span className="career-page__tab-desc">Request guidance with structured states from request to completion.</span>
            </Link>
          </div>
        </header>

        <div className="career-page__body">
          <section className="career-page__proof-strip" aria-label="Career engagement proof">
            {proofMetrics.map((metric) => (
              <div key={metric.label} className="career-page__proof-item">
                <p className="career-page__proof-value">{metric.value}</p>
                <p className="career-page__proof-label">{metric.label}</p>
              </div>
            ))}
          </section>

          {activeTab === "opportunities" ? (
            <section
              className={`career-page__main career-page__main--mixed${referralsCollapsed ? " career-page__main--referrals-collapsed" : ""}`}
              aria-labelledby="career-referrals-heading"
            >
              <div className={`career-page__rail career-page__rail--referrals${referralsCollapsed ? " is-collapsed" : ""}`}>
                <div className="career-page__section-head">
                  <h2 id="career-referrals-heading" className="career-page__panel-title">
                    Referral pipeline
                  </h2>
                  {referralsCollapsed ? (
                    <button
                      type="button"
                      className="career-page__collapsed-referrals-btn"
                      onClick={() => setReferralsCollapsed(false)}
                      aria-controls="career-referrals-content"
                      aria-expanded="false"
                    >
                      Referrals
                    </button>
                  ) : null}
                </div>
                {!referralsCollapsed ? (
                  <div id="career-referrals-content">
                    <p className="career-page__panel-copy body-text">
                      Keep referral discovery active while tracking conversations through each stage.
                    </p>
                    <div className="career-page__referral-conversion-list">
                      {Object.entries(referralStatusByRecipient).length === 0 ? (
                        <p className="career-page__referral-results-empty">No referral conversations started yet.</p>
                      ) : (
                        Object.entries(referralStatusByRecipient).map(([personId, status]) => (
                          <div key={personId} className="career-page__referral-conversion-item">
                            <span className="career-page__referral-conversion-person">{personId.slice(0, 8)}</span>
                            <span className="career-page__referral-conversion-status">{REFERRAL_STATUS_LABELS[status]}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="career-page__rail-separator" aria-hidden>
                <button
                  type="button"
                  className="career-page__rail-toggle"
                  aria-label={referralsCollapsed ? "Expand referrals panel" : "Collapse referrals panel"}
                  aria-expanded={!referralsCollapsed}
                  aria-controls="career-referrals-content"
                  onClick={() => setReferralsCollapsed((v) => !v)}
                >
                  {referralsCollapsed ? "›" : "‹"}
                </button>
              </div>

              <div className="career-page__rail career-page__rail--opportunities" aria-labelledby="career-openings-heading">
                <div className="career-page__listings-head">
                  <h2 id="career-openings-heading" className="career-page__openings-title">
                    {openRolesHeadline(feedMeta)}
                  </h2>
                </div>
                <BulletinPanel
                  ref={bulletinRef}
                  feedReady={feedReady}
                  showFeed
                  hideComposeCta
                  feedMine={false}
                  feedAuthorHistory={false}
                  feedExcludeAuthorSoftDeleted
                  showInlineAuthorReplies={false}
                  feedDisableAutoScroll={false}
                  lockedCategoryFilter="hiring"
                  domIdPrefix="career-bulletin"
                  showPanelHeader={false}
                  layout="career"
                  onFeedMetaChange={onFeedMetaChange}
                />

                <section className="career-page__my-posts" aria-labelledby="career-my-posts-heading">
                  <div className="career-page__section-separator" aria-hidden />
                  <h3 id="career-my-posts-heading" className="career-page__openings-title career-page__openings-title--mine">
                    Your hiring posts
                  </h3>
                  <BulletinPanel
                    feedReady={feedReady}
                    showFeed
                    hideComposeCta
                    feedMine
                    feedAuthorHistory
                    feedExcludeAuthorSoftDeleted={false}
                    showInlineAuthorReplies
                    feedDisableAutoScroll
                    lockedCategoryFilter="hiring"
                    domIdPrefix="career-bulletin-mine"
                    showPanelHeader={false}
                    layout="career"
                  />
                </section>
              </div>
            </section>
          ) : null}

          {activeTab === "referrals" ? (
            <section className="career-page__main career-page__main--single career-page__main--referrals">
              <h2 className="career-page__panel-title">Find someone for a referral</h2>
              <p className="career-page__panel-copy body-text">
                Use presets, search alumni, and move each conversation through a clear lifecycle.
              </p>
              <div className="career-page__preset-row">
                {REFERRAL_SEARCH_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="career-page__preset-chip"
                    onClick={() => applyReferralPreset(preset.query)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="career-page__referral-search" aria-labelledby="career-referrals-search-label">
                <span id="career-referrals-search-label" className="visually-hidden">
                  Alumni directory search
                </span>
                <DirectorySearchBar
                  variant="home"
                  keyword={searchQuery}
                  onKeywordChange={setSearchQuery}
                  onSubmit={handleSearchSubmit}
                  filterCount={referralFilterCount}
                  onOpenRefine={() => setFiltersOpen(true)}
                  inlineTrailingAction={
                    referralHasActiveFilters
                      ? {
                          label: "Clear filters",
                          onClick: clearReferralFilters,
                        }
                      : undefined
                  }
                />
                <DirectoryFilterDrawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter search">
                  <DirectoryFiltersForm
                    batchYear={filterBatch === "" ? null : filterBatch}
                    departmentCode={filterDept || null}
                    companyName={filterCompany.trim() || null}
                    occupationTypeCode={filterOcc || null}
                    residenceCountry={filterResidenceCountry || null}
                    residenceCity={filterResidenceCity || null}
                    onBatchYearChange={(y) => setFilterBatch(y === null ? "" : y)}
                    onDepartmentChange={(code) => setFilterDept(code ?? "")}
                    onCompanyNameChange={(v) => setFilterCompany(v ?? "")}
                    onOccupationChange={(code) => setFilterOcc(code ?? "")}
                    onResidenceCountryChange={(v) => setFilterResidenceCountry(v ?? "")}
                    onResidenceCityChange={(v) => setFilterResidenceCity(v ?? "")}
                    onClearAll={referralHasActiveFilters ? clearReferralFilters : undefined}
                    onSearch={() => {
                      commitReferralSearch();
                      setFiltersOpen(false);
                    }}
                  />
                </DirectoryFilterDrawer>
                {referralHasCommittedSearch ? (
                  <div className="career-page__referral-results" aria-live="polite">
                    <p className="career-page__referral-results-meta">
                      {referralSearchQuery.isFetching && referralResults.length === 0 ? (
                        <>
                          <Spinner size="sm" /> Searching…
                        </>
                      ) : (
                        <>
                          {referralResults.length} result{referralResults.length === 1 ? "" : "s"}
                          {referralHasActiveFilters ? " · filtered" : ""}
                        </>
                      )}
                    </p>
                    {referralError && referralResults.length === 0 ? (
                      <p className="home-dashboard__respond-error">{referralError}</p>
                    ) : null}
                    {!referralError && !referralSearchQuery.isFetching && referralResults.length === 0 ? (
                      <p className="career-page__referral-results-empty">No alumni match this search yet.</p>
                    ) : null}
                    {referralResults.length > 0 ? (
                      <div className="career-page__referral-results-list">
                        {referralResults.map((profile, index) => (
                          <SearchResultRow
                            key={profile.id}
                            profile={profile}
                            resultIndex={index}
                            searchSessionId={referralSessionId}
                            onRowClick={() => void openReferralChat(profile.id, profile.fullName)}
                          />
                        ))}
                      </div>
                    ) : null}
                    {referralSearchQuery.hasNextPage ? (
                      <div className="career-page__referral-results-more">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void referralSearchQuery.fetchNextPage()}
                          disabled={referralSearchQuery.isFetchingNextPage}
                        >
                          {referralSearchQuery.isFetchingNextPage ? "Loading…" : "Load more"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {activeTab === "mentorship" ? (
            <section className="career-page__main career-page__main--single">
              <h2 className="career-page__panel-title">Structured mentorship</h2>
              <p className="career-page__panel-copy body-text">
                Move mentor matches from intent to outcome with clear lifecycle states and tracked requests.
              </p>
              <div className="career-page__mentorship-summary">
                <span>Requested: {mentorshipSummary.requested}</span>
                <span>Accepted: {mentorshipSummary.accepted}</span>
                <span>Scheduled: {mentorshipSummary.scheduled}</span>
                <span>Completed: {mentorshipSummary.completed}</span>
              </div>
              <div className="career-page__mentor-grid">
                {MENTORSHIP_PROFILES.map((mentor) => {
                  const status = mentorshipStatusByMentor[mentor.id] ?? "not_started";
                  return (
                    <article key={mentor.id} className="career-page__mentor-card">
                      <h3 className="career-page__mentor-name">{mentor.name}</h3>
                      <p className="career-page__mentor-role">{mentor.role}</p>
                      <p className="career-page__mentor-availability">Availability: {mentor.availability}</p>
                      <p className="career-page__mentor-topics">Topics: {mentor.topics.join(" · ")}</p>
                      <p className="career-page__mentor-status">
                        Status: <strong>{MENTORSHIP_STATUS_LABELS[status]}</strong>
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => advanceMentorshipStatus(mentor.id)}
                        disabled={status === "completed"}
                      >
                        {status === "not_started" ? "Request mentorship" : status === "completed" ? "Completed" : "Move to next stage"}
                      </Button>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          <div className={`career-page__sticky-post-wrap${chatOpen ? " career-page__sticky-post-wrap--muted" : ""}`}>
            <Button type="button" variant="primary" onClick={() => bulletinRef.current?.openCompose()}>
              Post a role
            </Button>
          </div>

          {chatOpen ? (
            <div
              className="career-page__chat-overlay"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) closeReferralChat();
              }}
            >
              <div
                className="career-page__chat-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="career-referral-chat-title"
                ref={chatDialogRef}
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="career-page__chat-head">
                  <div>
                    <h3 id="career-referral-chat-title" className="career-page__chat-title">
                      {referralThreadDetail?.counterpartyFullName?.trim() ||
                        activeReferralRecipient?.name?.trim() ||
                        "Referral conversation"}
                    </h3>
                    {activeReferralStatus ? (
                      <p className="career-page__chat-thread-tag">
                        Referral status: {REFERRAL_STATUS_LABELS[activeReferralStatus]}
                      </p>
                    ) : null}
                  </div>
                  <div className="career-page__chat-head-actions">
                    <button
                      type="button"
                      className="career-page__chat-minimize"
                      aria-label="Minimize chat"
                      onClick={() => setReferralChatMinimized(true)}
                    >
                      —
                    </button>
                    <button
                      type="button"
                      className="career-page__chat-close"
                      aria-label="Close chat"
                      onClick={closeReferralChat}
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="career-page__status-row">
                  {REFERRAL_LIFECYCLE.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`career-page__status-chip${activeReferralStatus === status ? " is-active" : ""}`}
                      onClick={() => setActiveReferralStatus(status)}
                    >
                      {REFERRAL_STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
                <div className="career-page__template-row">
                  {activeReferralRecipient
                    ? REFERRAL_TEMPLATES.map((template) => (
                        <button
                          key={template}
                          type="button"
                          className="career-page__template-chip"
                          onClick={() => setReferralComposer(formatTemplate(template, activeReferralRecipient.name))}
                        >
                          Use template
                        </button>
                      ))
                    : null}
                </div>
                {referralActionError ? <p className="home-dashboard__respond-error">{referralActionError}</p> : null}
                {referralThreadDetail?.messagesDeletionWarning ? (
                  <p className="career-page__chat-retention-banner" role="status">
                    {referralThreadDetail.messagesDeletionWarning}
                  </p>
                ) : null}
                {referralThreadDetail?.showOfflineContactPrompt ? (
                  <p className="career-page__chat-offline-prompt" role="status">
                    You have replied {referralThreadDetail.referralReplyCount} times. Please share contact details and take
                    this conversation offline.
                  </p>
                ) : null}
                <div className="career-page__chat-messages" aria-label="Messages">
                  {hasActiveReferralThread && referralThreadQuery.isPending ? (
                    <p className="career-page__chat-empty">Loading conversation…</p>
                  ) : hasActiveReferralThread && referralThreadQuery.isError ? (
                    <p className="career-page__chat-empty">
                      {referralThreadQuery.error instanceof Error
                        ? referralThreadQuery.error.message
                        : "Could not load conversation."}
                    </p>
                  ) : referralThreadDetail?.messages.length ? (
                    referralThreadDetail.messages.map((m) => {
                      const mine = m.authorPersonId === myPersonId;
                      return (
                        <div
                          key={m.id}
                          className={`career-page__chat-msg${mine ? " career-page__chat-msg--mine" : ""}`}
                        >
                          <p className="career-page__chat-msg-body">{m.body}</p>
                          <time className="career-page__chat-msg-time" dateTime={m.createdAt}>
                            {formatThreadTime(m.createdAt)}
                          </time>
                        </div>
                      );
                    })
                  ) : null}
                </div>
                <div className="career-page__chat-composer">
                  <div className="home-dashboard__textarea-with-counter">
                    <textarea
                      className="input home-dashboard__respond-textarea home-dashboard__respond-textarea--with-counter"
                      rows={3}
                      placeholder="Write a message…"
                      maxLength={300}
                      value={referralComposer}
                      onChange={(e) => setReferralComposer(e.target.value)}
                      disabled={referralSending}
                    />
                    <span className="home-dashboard__textarea-counter" aria-live="polite">
                      {referralComposer.length} / 300
                    </span>
                  </div>
                  <div className="career-page__chat-actions">
                    <Button type="button" variant="secondary" onClick={closeReferralChat} disabled={referralSending}>
                      Close
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => void sendReferralMessage()}
                      disabled={referralSending || !referralComposer.trim()}
                    >
                      {referralSending ? "Sending…" : "Send"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
