import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
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
        </header>

        <div className="career-page__body">
          <section
            className={`career-page__main career-page__main--mixed${referralsCollapsed ? " career-page__main--referrals-collapsed" : ""}`}
            aria-labelledby="career-referrals-heading"
          >
            <div className={`career-page__rail career-page__rail--referrals${referralsCollapsed ? " is-collapsed" : ""}`}>
              <div className="career-page__section-head">
                <h2 id="career-referrals-heading" className="career-page__panel-title">
                  Find someone for a referral
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
                    Search the alumni directory by keyword, company, department, batch, or where people live — then open a
                    profile to reach out.
                  </p>
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
                              {referralThreadDetail?.kind === "referral" ? (
                                <p className="career-page__chat-thread-tag">Referral chat</p>
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
                  {referralActionError ? <p className="home-dashboard__respond-error">{referralActionError}</p> : null}
                          {referralThreadDetail?.messagesDeletionWarning ? (
                            <p className="career-page__chat-retention-banner" role="status">
                              {referralThreadDetail.messagesDeletionWarning}
                            </p>
                          ) : null}
                          {referralThreadDetail?.showOfflineContactPrompt ? (
                            <p className="career-page__chat-offline-prompt" role="status">
                              You have replied {referralThreadDetail.referralReplyCount} times. Please share contact details
                              and take this conversation offline.
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
