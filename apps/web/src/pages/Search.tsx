import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { SearchResultRow } from "../components/SearchResultRow";
import { DirectorySearchBar } from "../components/DirectorySearchBar";
import { DirectoryFilterDrawer } from "../components/DirectoryFilterDrawer";
import { DirectoryFiltersForm } from "../components/DirectoryFiltersForm";
import { Spinner } from "../components/Spinner";
import { PageStateBlock } from "../components/PageStateBlock";
import { type SearchResult, type SearchProfileView } from "../api/client";
import { assertApiGet } from "../lib/assertApiGet";
import { queryKeys } from "../lib/queryKeys";
import { DIRECTORY_INFINITE_QUERY_OPTIONS } from "../constants/directorySearch";
import {
  buildSearchParamsFromDraft,
  countDirectoryFilterParams,
  draftMatchesUrl,
  draftsEqual,
  EMPTY_DIRECTORY_SEARCH_DRAFT,
  normalizeQ,
  parseDirectorySearchFromParams,
  type DirectorySearchDraft,
} from "../lib/directorySearchUrlState";

/** Directory results: 2 columns from this min-width; one column below (narrow phones). */
const SEARCH_RESULTS_TWO_COL_MIN_PX = 720;

export function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState(() => parseDirectorySearchFromParams(searchParams));
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [resultsColumnCount, setResultsColumnCount] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia(`(min-width: ${SEARCH_RESULTS_TWO_COL_MIN_PX}px)`).matches
      ? 2
      : 1
  );

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${SEARCH_RESULTS_TWO_COL_MIN_PX}px)`);
    const sync = () => setResultsColumnCount(mq.matches ? 2 : 1);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
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
  const searchPending = !draftMatchesUrl(draft, searchParams);

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

  const listLayoutKey =
    `${wideningSummary ?? ""}|${normalization?.applied ?? false}|${searchPending}|${showMainSpinner}|${errorMessage ?? ""}|${results.length}`;

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
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [listLayoutKey]);

  const virtualizer = useWindowVirtualizer({
    count: resultsRowCount,
    estimateSize: () => (resultsColumnCount === 2 ? 96 : 92),
    overscan: 10,
    scrollMargin: listScrollMargin,
  });

  const commitDraftToUrl = useCallback(() => {
    setSearchParams(buildSearchParamsFromDraft(draft), { replace: true });
  }, [draft, setSearchParams]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    commitDraftToUrl();
  };

  const clearAllFilters = useCallback(() => {
    setDraft(EMPTY_DIRECTORY_SEARCH_DRAFT);
    setSearchParams(new URLSearchParams(), { replace: true });
    setFiltersOpen(false);
  }, [setSearchParams]);

  const canClear =
    !draftsEqual(draft, EMPTY_DIRECTORY_SEARCH_DRAFT) ||
    !draftMatchesUrl(EMPTY_DIRECTORY_SEARCH_DRAFT, searchParams);

  const hasActiveFilters =
    batch != null ||
    !!dept ||
    !!company ||
    !!occ ||
    !!residenceCountry ||
    !!residenceCity ||
    !!committedQ;

  const filterCount = countDirectoryFilterParams(draft);

  const setDraftPatch = useCallback((patch: Partial<DirectorySearchDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  const searchSessionId = firstPage?.searchSessionId ?? null;

  return (
    <>
      <Nav />
      <div className="search-page search-page--search-first">
        <header className="search-page__hero">
          <div className="search-page__hero-inner">
            <h1 className="search-page__title search-page__title--hero">Alumni directory</h1>
            <DirectorySearchBar
              variant="directory"
              keyword={draft.q}
              onKeywordChange={(q) => setDraftPatch({ q })}
              onSubmit={handleSearchSubmit}
              filterCount={filterCount}
              onOpenRefine={() => setFiltersOpen(true)}
              keywordPlaceholder="Name, role, company…"
              autoFocusKeyword
              inlineTrailingAction={{
                label: "Clear all filters",
                onClick: clearAllFilters,
                disabled: !canClear,
              }}
              onNativeSearchCleared={clearAllFilters}
            />
            {searchPending ? (
              <p className="search-page__pending search-page__pending--under-bar" role="status">
                Press Search or Enter to run this search.
              </p>
            ) : null}
          </div>
        </header>

        {wideningSummary ? (
          <div className="search-page__notice" role="status">
            <p className="search-page__notice-text">{wideningSummary}</p>
          </div>
        ) : null}

        {normalization?.applied ? (
          <div className="search-page__notice search-page__notice--muted" role="status">
            <p className="search-page__notice-text">
              Filtered your search from keywords
              {normalization.batchFromQuery != null ? ` · batch ${normalization.batchFromQuery}` : ""}
              {normalization.deptFromQuery ? ` · dept ${normalization.deptFromQuery}` : ""}
              {normalization.companyFromQuery ? ` · company ${normalization.companyFromQuery}` : ""}
              {normalization.removedTokens?.length ? ` (removed: ${normalization.removedTokens.join(", ")})` : ""}.
            </p>
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
            onBatchYearChange={(y) => setDraftPatch({ batch: y })}
            onDepartmentChange={(code) => setDraftPatch({ dept: code })}
            onCompanyNameChange={(v) => setDraftPatch({ company: v })}
            onOccupationChange={(code) => setDraftPatch({ occ: code })}
            onResidenceCountryChange={(v) => setDraftPatch({ residenceCountry: v })}
            onResidenceCityChange={(v) => setDraftPatch({ residenceCity: v })}
            onClearAll={canClear ? clearAllFilters : undefined}
            onSearch={() => {
              commitDraftToUrl();
              setFiltersOpen(false);
            }}
          />
        </DirectoryFilterDrawer>

        <main className="search-page__main">
          <div className="search-page__toolbar">
            <div className="search-page__toolbar-inner">
              <p
                className={`search-page__toolbar-meta${fetchingMain && !errorMessage ? " search-page__toolbar-meta--busy" : ""}`}
              >
                {errorMessage ? (
                  <span className="search-page__error-inline">{errorMessage}</span>
                ) : fetchingMain ? (
                  <>
                    <Spinner size="sm" />
                    {results.length === 0 ? (
                      <span>Searching…</span>
                    ) : (
                      <span>
                        {results.length} result{results.length !== 1 ? "s" : ""}
                        {hasActiveFilters ? " · filtered" : ""}
                        <span className="search-page__updating-suffix"> · updating…</span>
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    {results.length} result{results.length !== 1 ? "s" : ""}
                    {hasActiveFilters ? " · filtered" : ""}
                  </>
                )}
              </p>
            </div>
          </div>

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
              <PageStateBlock title="Couldn’t load results" description={errorMessage} tone="error" />
            </div>
          ) : null}

          {!fetchingMain && !errorMessage && results.length === 0 ? (
            <div className="search-page__empty">
              <PageStateBlock
                title="No alumni match your search"
                description={
                  <>
                    Try another keyword, open <strong>Filter</strong> to adjust batch or department, or clear filters.
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
                    onClick={() => void searchQuery.fetchNextPage()}
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
    </>
  );
}
