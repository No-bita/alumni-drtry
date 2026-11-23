import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { SearchResultRow, type SearchCardNote } from "../components/SearchResultRow";
import { MatchReachOutDialog } from "../components/MatchReachOutDialog";
import { CareerStyleSearchToolbar } from "../components/CareerStyleSearchToolbar";
import { DirectoryFilterChipStrip } from "../components/DirectoryFilterChipStrip";
import { DirectoryFilterDrawer } from "../components/DirectoryFilterDrawer";
import { DirectoryFiltersForm } from "../components/DirectoryFiltersForm";
import { Spinner } from "../components/Spinner";
import { PageStateBlock } from "../components/PageStateBlock";
import { type SearchResult, type SearchProfileView } from "../api/client";
import { assertApiGet } from "../lib/assertApiGet";
import { queryKeys } from "../lib/queryKeys";
import { DIRECTORY_INFINITE_QUERY_OPTIONS, DIRECTORY_KEYWORD_MAX_LENGTH } from "../constants/directorySearch";
import { cityIntentHrefForPick, tryAtPrefixedCityHubPick } from "../lib/cityIntentFromToolbar";
import {
  buildSearchParamsFromDraft,
  clearDirectorySearchFacet,
  countDirectoryFilterParams,
  draftMatchesUrl,
  draftsEqual,
  EMPTY_DIRECTORY_SEARCH_DRAFT,
  normalizeQ,
  parseDirectorySearchFromParams,
  type DirectorySearchDraft,
} from "../lib/directorySearchUrlState";
import { trackBetaUsageEvent } from "../lib/betaAnalytics";
import { browsingLimitFromError } from "../lib/browsingLimits";

/**
 * Directory grid columns come from the width the results actually get (the page minus the side nav),
 * so every card is at least ~300px wide: 1 column, then 2 from 622px, then 3 from 944px
 * (cards plus the 22px gaps).
 */
const SEARCH_RESULTS_TWO_COL_MIN_PX = 622;
const SEARCH_RESULTS_THREE_COL_MIN_PX = 944;

function directoryResultsColumnCount(resultsWidth: number): 1 | 2 | 3 {
  if (resultsWidth >= SEARCH_RESULTS_THREE_COL_MIN_PX) return 3;
  if (resultsWidth >= SEARCH_RESULTS_TWO_COL_MIN_PX) return 2;
  return 1;
}

export function Search() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState(() => parseDirectorySearchFromParams(searchParams));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const lastZeroResultKeyRef = useRef<string | null>(null);

  const [resultsColumnCount, setResultsColumnCount] = useState<1 | 2 | 3>(1);
  /** Reach out from a card: the note form is drawn here, outside the virtual list (its rows are transformed and recycled). */
  const [reachingOut, setReachingOut] = useState<SearchProfileView | null>(null);
  /** Reachout states learnt on this page (looked up on tap, or just sent), by member id. */
  const [cardNotes, setCardNotes] = useState<Record<string, Exclude<SearchCardNote, null>>>({});
  const setCardNote = useCallback((personId: string, note: Exclude<SearchCardNote, null>) => {
    setCardNotes((prev) => (prev[personId] === note ? prev : { ...prev, [personId]: note }));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Browser back/forward URL changes must restore editable search fields.
    setDraft(parseDirectorySearchFromParams(searchParams));
  }, [searchParams]);

  const applied = useMemo(() => parseDirectorySearchFromParams(searchParams), [searchParams]);

  const batch = applied.batch;
  const dept = applied.dept;
  const company = applied.company;
  const occ = applied.occ;
  const residenceCountry = applied.residenceCountry;
  const residenceCity = applied.residenceCity;
  const committedQ = normalizeQ(applied.q);

  const draftRef = useRef(draft);
  useLayoutEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const urlCommitTimerRef = useRef<number | null>(null);

  const cancelDebouncedUrlCommit = useCallback(() => {
    if (urlCommitTimerRef.current != null) {
      window.clearTimeout(urlCommitTimerRef.current);
      urlCommitTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => cancelDebouncedUrlCommit(), [cancelDebouncedUrlCommit]);

  const applyCommittedSearch = useCallback(
    (next: DirectorySearchDraft) => {
      const pick = tryAtPrefixedCityHubPick(next.q);
      if (pick) {
        cancelDebouncedUrlCommit();
        navigate(cityIntentHrefForPick(pick));
        setFiltersOpen(false);
        return;
      }
      setSearchParams(buildSearchParamsFromDraft(next), { replace: true });
    },
    [navigate, setSearchParams, cancelDebouncedUrlCommit],
  );

  const scheduleDebouncedApplyCommittedSearch = useCallback(() => {
    cancelDebouncedUrlCommit();
    urlCommitTimerRef.current = window.setTimeout(() => {
      urlCommitTimerRef.current = null;
      applyCommittedSearch(draftRef.current);
    }, 450);
  }, [applyCommittedSearch, cancelDebouncedUrlCommit]);

  const commitDraftPatchImmediate = useCallback(
    (patch: Partial<DirectorySearchDraft>) => {
      cancelDebouncedUrlCommit();
      const next = { ...draftRef.current, ...patch };
      draftRef.current = next;
      setDraft(next);
      applyCommittedSearch(next);
      trackBetaUsageEvent("search_filters_changed", {
        source: "immediate_commit",
        patchKeys: Object.keys(patch),
      });
    },
    [applyCommittedSearch, cancelDebouncedUrlCommit],
  );

  const patchDraftTextField = useCallback(
    (patch: Partial<Pick<DirectorySearchDraft, "company" | "residenceCity" | "residenceCountry">>) => {
      const next = { ...draftRef.current, ...patch };
      draftRef.current = next;
      setDraft(next);
      scheduleDebouncedApplyCommittedSearch();
      trackBetaUsageEvent("search_filters_changed", {
        source: "text_field",
        patchKeys: Object.keys(patch),
      });
    },
    [scheduleDebouncedApplyCommittedSearch],
  );

  const removeFacet = useCallback(
    (key: keyof DirectorySearchDraft) => {
      cancelDebouncedUrlCommit();
      const next = clearDirectorySearchFacet(applied, key);
      setSearchParams(buildSearchParamsFromDraft(next), { replace: true });
      trackBetaUsageEvent("search_filters_changed", {
        source: "facet_remove",
        key,
      });
    },
    [applied, cancelDebouncedUrlCommit, setSearchParams],
  );

  const buildQueryParams = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams();
      if (batch != null) params.set("batch", String(batch));
      if (dept) params.set("dept", dept);
      if (company) params.set("company", company);
      if (occ) params.set("occ", occ);
      if (residenceCountry) params.set("residenceCountry", residenceCountry);
      if (residenceCity) params.set("residenceCity", residenceCity);
      if (committedQ) params.set("q", committedQ);
      params.set("limit", "20");
      if (cursor) params.set("cursor", cursor);
      return params;
    },
    [batch, dept, company, occ, residenceCountry, residenceCity, committedQ]
  );

  const searchQueryKey = useMemo(
    () =>
      queryKeys.directory.searchInfinite(
        batch,
        dept ?? "",
        company ?? "",
        occ ?? "",
        residenceCountry ?? "",
        residenceCity ?? "",
        committedQ
      ),
    [batch, dept, company, occ, residenceCountry, residenceCity, committedQ]
  );

  const searchQuery = useInfiniteQuery({
    queryKey: searchQueryKey,
    queryFn: async ({ pageParam, signal }) => {
      const params = buildQueryParams(pageParam ?? null);
      return assertApiGet<SearchResult>(`/v1/search?${params.toString()}`, signal);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor ?? undefined,
    ...DIRECTORY_INFINITE_QUERY_OPTIONS,
  });

  const results = useMemo(
    () => searchQuery.data?.pages.flatMap((p) => p.results) ?? [],
    [searchQuery.data]
  );

  const errorMessage =
    searchQuery.error instanceof Error ? searchQuery.error.message : searchQuery.error ? String(searchQuery.error) : null;

  const fetchingMain = searchQuery.isFetching && !searchQuery.isFetchingNextPage;
  const showMainSpinner = fetchingMain && results.length === 0 && !errorMessage;
  /** Keyword-only pending — drawer filter edits use debounced/immediate URL commits without this banner. */
  const searchPending = normalizeQ(draft.q) !== committedQ;

  const firstPage = searchQuery.data?.pages[0];
  const wideningSummary = firstPage?.wideningSummary ?? null;
  const normalization = firstPage?.normalization ?? null;

  /** Anchor for window virtualizer: document Y offset to top of results list (see scrollMargin). */
  const resultsListAnchorRef = useRef<HTMLDivElement>(null);
  const [listScrollMargin, setListScrollMargin] = useState(0);

  const resultsRowCount = useMemo(
    () => (results.length === 0 ? 0 : Math.ceil(results.length / resultsColumnCount)),
    [results.length, resultsColumnCount]
  );

  const hasResults = results.length > 0;
  // Measure the results strip before paint, and again whenever its width changes.
  useLayoutEffect(() => {
    const el = resultsListAnchorRef.current;
    if (!el) return;
    const sync = () => setResultsColumnCount(directoryResultsColumnCount(el.getBoundingClientRect().width));
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasResults, errorMessage]);

  const listLayoutKey =
    `${wideningSummary ?? ""}|${normalization?.applied ?? false}|${searchPending}|${showMainSpinner}|${errorMessage ?? ""}|${results.length}|${resultsColumnCount}`;

  useLayoutEffect(() => {
    const el = resultsListAnchorRef.current;
    const main = el?.closest(".search-page__main");
    if (!el || !main) return;

    const update = () => {
      setListScrollMargin(el.getBoundingClientRect().top + window.scrollY);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(main);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [listLayoutKey]);

  const virtualizer = useWindowVirtualizer({
    count: resultsRowCount,
    /** Approx row height (directory cards + grid gap); rows are measured once drawn (`.search-page__virtual-row`, `.search-card`). */
    estimateSize: () =>
      resultsColumnCount === 3 ? 300 : resultsColumnCount === 2 ? 275 : 255,
    overscan: 8,
    scrollMargin: listScrollMargin,
  });

  const runCommittedSearchOrCityHub = useCallback(
    (options?: { closeFilters?: boolean }) => {
      cancelDebouncedUrlCommit();
      applyCommittedSearch(draft);
      if (options?.closeFilters) setFiltersOpen(false);
    },
    [draft, applyCommittedSearch, cancelDebouncedUrlCommit],
  );

  const clearAllFilters = useCallback(() => {
    cancelDebouncedUrlCommit();
    setDraft(EMPTY_DIRECTORY_SEARCH_DRAFT);
    setSearchParams(new URLSearchParams(), { replace: true });
    setFiltersOpen(false);
    trackBetaUsageEvent("search_filters_changed", { source: "clear_all" });
  }, [cancelDebouncedUrlCommit, setSearchParams]);

  /** How many search inputs are set (keyword counts as one); the only search detail we record. */
  const activeFilterCount = [batch, dept, company, occ, residenceCountry, residenceCity, committedQ].filter(
    (v) => v != null && String(v).trim() !== "",
  ).length;

  // One "search_executed" per new committed search (not per refetch or page).
  const lastExecutedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = searchQueryKey.join("|");
    if (lastExecutedKeyRef.current === key) return;
    lastExecutedKeyRef.current = key;
    trackBetaUsageEvent("search_executed", { count: activeFilterCount });
  }, [activeFilterCount, searchQueryKey]);

  useEffect(() => {
    if (fetchingMain || Boolean(errorMessage) || results.length !== 0) return;
    const key = searchQueryKey.join("|");
    if (lastZeroResultKeyRef.current === key) return;
    lastZeroResultKeyRef.current = key;
    // No search text or filter values leave the browser: only how many filters were set.
    trackBetaUsageEvent("search_zero_results", { count: activeFilterCount });
  }, [activeFilterCount, errorMessage, fetchingMain, results.length, searchQueryKey]);

  const canClear =
    !draftsEqual(draft, EMPTY_DIRECTORY_SEARCH_DRAFT) ||
    !draftMatchesUrl(EMPTY_DIRECTORY_SEARCH_DRAFT, searchParams);

  const filterCount = countDirectoryFilterParams(applied);

  const setDraftPatch = useCallback((patch: Partial<DirectorySearchDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  /** Full directory reset when keyword is cleared (native × or deleting text): URL drives results. */
  const onDirectoryKeywordChange = useCallback(
    (q: string) => {
      const prevQ = draftRef.current.q;
      if (q === "" && prevQ.trim() !== "") {
        clearAllFilters();
        return;
      }
      setDraftPatch({ q });
    },
    [clearAllFilters, setDraftPatch],
  );

  const searchSessionId = firstPage?.searchSessionId ?? null;

  const toolbarLead = (
    <div className="nav-app-toolbar__welcome">
      <h1 className="nav-app-toolbar__welcome-title">Alumni directory</h1>
    </div>
  );

  return (
    <>
      <Nav appToolbarLead={toolbarLead} appToolbarSearch={null} />
      <div className="search-page search-page--search-first">
        {searchPending ? (
          <header className="search-page__hero">
            <div className="search-page__hero-inner">
              <p className="search-page__pending search-page__pending--under-bar" role="status">
                Press Search or Enter to run this search.
              </p>
            </div>
          </header>
        ) : null}

        {wideningSummary ? (
          <div className="search-page__notice" role="status">
            <p className="search-page__notice-text">{wideningSummary}</p>
          </div>
        ) : null}

        <DirectoryFilterDrawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter search">
          <DirectoryFiltersForm
            batchYear={draft.batch}
            departmentCode={draft.dept}
            companyName={draft.company}
            occupationTypeCode={draft.occ}
            residenceCountry={draft.residenceCountry}
            residenceCity={draft.residenceCity}
            onBatchYearChange={(y) => commitDraftPatchImmediate({ batch: y })}
            onDepartmentChange={(code) => commitDraftPatchImmediate({ dept: code })}
            onCompanyNameChange={(v) => patchDraftTextField({ company: v })}
            onOccupationChange={(code) => commitDraftPatchImmediate({ occ: code })}
            onResidenceCountryChange={(v) => patchDraftTextField({ residenceCountry: v })}
            onResidenceCityChange={(v) => patchDraftTextField({ residenceCity: v })}
            onClearAll={canClear ? clearAllFilters : undefined}
          />
        </DirectoryFilterDrawer>

        <main className="search-page__main">
          <section className="search-page__career-toolbar" aria-label="Directory quick search">
            <CareerStyleSearchToolbar
              keyword={draft.q}
              onKeywordChange={onDirectoryKeywordChange}
              onSubmitKeyword={() => runCommittedSearchOrCityHub()}
              filterCount={filterCount}
              onOpenFilters={() => setFiltersOpen(true)}
              filtersDrawerOpen={filtersOpen}
              keywordFieldLabel="Alumni directory keyword — prefix with @ and a city to open its hub, or enter any search terms"
              keywordMaxLength={DIRECTORY_KEYWORD_MAX_LENGTH}
              afterFilters={
                filterCount > 0 ? (
                  <button
                    type="button"
                    className="directory-search-bar__inline-action"
                    aria-label="Reset directory filters"
                    onClick={clearAllFilters}
                  >
                    Clear all filters
                  </button>
                ) : undefined
              }
            />
          </section>
          <DirectoryFilterChipStrip applied={applied} onRemoveFacet={removeFacet} />
          {showMainSpinner ? (
            <div className="search-page__loading" role="status" aria-live="polite" aria-busy="true">
              <div className="login-sending">
                <Spinner />
                <p className="login-sending__line">Searching…</p>
              </div>
            </div>
          ) : null}

          {!fetchingMain && errorMessage && results.length === 0 ? (
            <div className="search-page__empty">
              <PageStateBlock
                title={browsingLimitFromError(searchQuery.error) ? "Browsing paused" : "Couldn’t load results"}
                description={errorMessage}
                tone="error"
              />
            </div>
          ) : null}

          {!fetchingMain && !errorMessage && results.length === 0 ? (
            <div className="search-page__empty">
              <PageStateBlock
                title="No alumni match your search"
                description={
                  <>
                    Try another keyword, use <strong>Filter</strong> on the search bar to narrow results, or clear filters.
                  </>
                }
              />
            </div>
          ) : null}

          {!errorMessage && results.length > 0 ? (
            <>
              <div ref={resultsListAnchorRef} className="search-page__results-scroll">
                <div
                  className="search-page__virtual-track"
                  style={{ height: virtualizer.getTotalSize(), position: "relative" }}
                >
                  {virtualizer.getVirtualItems().map((vi) => {
                    const rowIndex = vi.index;
                    const cells: ReactNode[] = [];
                    for (let c = 0; c < resultsColumnCount; c++) {
                      const profileIndex = rowIndex * resultsColumnCount + c;
                      if (profileIndex >= results.length) break;
                      const profile = results[profileIndex] as SearchProfileView;
                      cells.push(
                        <div key={profile.id} className="search-page__result-cell">
                          <SearchResultRow
                            profile={profile}
                            note={cardNotes[profile.id] ?? null}
                            onNote={setCardNote}
                            onReachOut={setReachingOut}
                            resultIndex={profileIndex}
                            searchSessionId={searchSessionId}
                            style={{ animationDelay: `${Math.min(profileIndex, 12) * 24}ms` }}
                          />
                        </div>
                      );
                    }
                    return (
                      <div
                        key={vi.key}
                        data-index={vi.index}
                        ref={virtualizer.measureElement}
                        className={`search-page__virtual-row search-page__virtual-row--dense search-page__virtual-row--cols-${resultsColumnCount}`}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${vi.start - listScrollMargin}px)`,
                        }}
                      >
                        {cells}
                      </div>
                    );
                  })}
                </div>
              </div>
              {searchQuery.hasNextPage ? (
                <div className="search-page__load-more">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      trackBetaUsageEvent("search_load_more_clicked", { resultsCount: results.length });
                      void searchQuery.fetchNextPage();
                    }}
                    disabled={searchQuery.isFetchingNextPage}
                  >
                    {searchQuery.isFetchingNextPage ? (
                      <>
                        <Spinner size="sm" />
                        Loading…
                      </>
                    ) : (
                      "Load more"
                    )}
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </main>
      </div>
      {reachingOut ? (
        <MatchReachOutDialog
          recipient={{ id: reachingOut.id, fullName: reachingOut.fullName?.trim() || "Alum" }}
          referral={{ company: reachingOut.headlineOrganizationName?.trim() || null }}
          source="search"
          onSent={() => setCardNote(reachingOut.id, "pending")}
          onClose={() => setReachingOut(null)}
        />
      ) : null}
    </>
  );
}
