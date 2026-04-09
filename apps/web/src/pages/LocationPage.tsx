import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { DirectoryFilterDrawer } from "../components/DirectoryFilterDrawer";
import { DirectoryFiltersForm } from "../components/DirectoryFiltersForm";
import { LocationDirectoryCard } from "../components/LocationDirectoryCard";
import { Spinner } from "../components/Spinner";
import { useAuth } from "../contexts/AuthContext";
import { LOCATION_LENS_TOP_CITIES_FALLBACK, type TopCityPick } from "../constants/locationLens";
import {
  type MyProfileView,
  type ResidenceCityAggregate,
  type ResidenceCitiesResponse,
  type SearchResult,
} from "../api/client";
import {
  DIRECTORY_INFINITE_QUERY_OPTIONS,
  DIRECTORY_KEYWORD_MAX_LENGTH,
  RESIDENCE_CITIES_AGGREGATE_LIMIT,
  RESIDENCE_CITIES_QUERY_OPTIONS,
  RESIDENCE_CITIES_SIDEBAR_LIMIT,
} from "../constants/directorySearch";
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
import { assertApiGet } from "../lib/assertApiGet";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";
import { queryKeys } from "../lib/queryKeys";

function navDisplayName(profile: MyProfileView | undefined, email: string | undefined): string {
  const fn = profile?.fullName?.trim();
  if (fn) {
    const parts = fn.split(/\s+/);
    return parts[0] ?? fn;
  }
  return displayFirstNameFromEmail(email);
}

function cityPickMatchesDraft(
  pick: TopCityPick,
  residenceCity: string | null,
  residenceCountry: string | null
): boolean {
  const c = residenceCity?.trim().toLowerCase() ?? "";
  const co = residenceCountry?.trim().toLowerCase() ?? "";
  return c === pick.city.toLowerCase() && co === pick.country.toLowerCase();
}

function useLocationLensGridColumns(): number {
  const [cols, setCols] = useState(2);

  useEffect(() => {
    const mq3 = window.matchMedia("(min-width: 640px)");
    const mq4 = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      setCols(mq4.matches ? 4 : mq3.matches ? 3 : 2);
    };
    apply();
    mq3.addEventListener("change", apply);
    mq4.addEventListener("change", apply);
    return () => {
      mq3.removeEventListener("change", apply);
      mq4.removeEventListener("change", apply);
    };
  }, []);

  return cols;
}

export function LocationPage() {
  const auth = useAuth();
  const authMyProfile = auth.status === "authenticated" ? auth.myProfile : undefined;
  const [searchParams, setSearchParams] = useSearchParams();
  const searchFieldId = useId();

  const [loadStatus, setLoadStatus] = useState<"loading" | "done" | "error">("loading");

  const [draft, setDraft] = useState(() => parseDirectorySearchFromParams(searchParams));
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    if (!authMyProfile) {
      queueMicrotask(() => setLoadStatus("error"));
      return;
    }
    queueMicrotask(() => setLoadStatus("done"));
  }, [auth.status, authMyProfile]);

  /** Strip legacy query keys from bookmarks. */
  useEffect(() => {
    if (!searchParams.has("scope") && !searchParams.has("lens")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("scope");
    next.delete("lens");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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
      params.set("requireResidence", "true");
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
        committedQ,
        true
      ),
    [batch, dept, company, occ, residenceCountry, residenceCity, committedQ]
  );

  const topCitiesQuery = useQuery({
    queryKey: queryKeys.directory.residenceCities(RESIDENCE_CITIES_AGGREGATE_LIMIT),
    queryFn: async ({ signal }) => {
      const data = await assertApiGet<ResidenceCitiesResponse>(
        `/v1/directory/residence-cities?limit=${RESIDENCE_CITIES_AGGREGATE_LIMIT}`,
        signal
      );
      return data.cities ?? [];
    },
    enabled: auth.status === "authenticated" && loadStatus === "done",
    ...RESIDENCE_CITIES_QUERY_OPTIONS,
  });

  const topCitiesRows: ResidenceCityAggregate[] | null = useMemo(() => {
    const rows = topCitiesQuery.data;
    if (rows && rows.length > 0) {
      return rows;
    }
    if (topCitiesQuery.isError) {
      return LOCATION_LENS_TOP_CITIES_FALLBACK.map((p) => ({ ...p, count: 0 }));
    }
    return null;
  }, [topCitiesQuery.data, topCitiesQuery.isError]);

  const sidebarTopCities = useMemo(
    () => (topCitiesRows ? topCitiesRows.slice(0, RESIDENCE_CITIES_SIDEBAR_LIMIT) : null),
    [topCitiesRows]
  );

  const searchQuery = useInfiniteQuery({
    ...DIRECTORY_INFINITE_QUERY_OPTIONS,
    queryKey: searchQueryKey,
    queryFn: async ({ pageParam, signal }) => {
      const params = buildQueryParams(pageParam ?? null);
      return assertApiGet<SearchResult>(`/v1/search?${params.toString()}`, signal);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor ?? undefined,
    enabled: auth.status === "authenticated" && loadStatus === "done",
  });

  const results = useMemo(
    () => searchQuery.data?.pages.flatMap((p) => p.results) ?? [],
    [searchQuery.data]
  );

  const gridColumns = useLocationLensGridColumns();
  const rowCount = useMemo(
    () => (results.length > 0 ? Math.ceil(results.length / gridColumns) : 0),
    [results.length, gridColumns]
  );

  const resultsScrollRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library -- virtualizer helpers; intentional
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => resultsScrollRef.current,
    estimateSize: () => 268,
    overscan: 4,
  });

  const errorMessage =
    searchQuery.error instanceof Error ? searchQuery.error.message : searchQuery.error ? String(searchQuery.error) : null;

  const fetchingMain = searchQuery.isFetching && !searchQuery.isFetchingNextPage;
  const showMainSpinner = fetchingMain && results.length === 0 && !errorMessage;

  const commitDraftToUrl = useCallback(() => {
    setSearchParams(buildSearchParamsFromDraft(draft), { replace: true });
  }, [draft, setSearchParams]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    commitDraftToUrl();
  };

  const clearAllFilters = () => {
    setDraft(EMPTY_DIRECTORY_SEARCH_DRAFT);
    setSearchParams(new URLSearchParams(), { replace: true });
    setFiltersOpen(false);
  };

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

  const filterCountWithoutPlace = useMemo(
    () =>
      countDirectoryFilterParams({
        ...draft,
        residenceCity: null,
        residenceCountry: null,
      }),
    [draft]
  );

  const hasCommittedPlace = Boolean(residenceCity?.trim() && residenceCountry?.trim());

  const setDraftPatch = useCallback((patch: Partial<DirectorySearchDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  const firstPage = searchQuery.data?.pages[0];
  const searchSessionId = firstPage?.searchSessionId ?? null;
  const wideningSummary = firstPage?.wideningSummary ?? null;

  const fullDirectoryHref = useMemo(() => {
    const p = new URLSearchParams(searchParams);
    p.delete("scope");
    p.delete("lens");
    const qs = p.toString();
    return qs ? `/search?${qs}` : "/search";
  }, [searchParams]);

  const pickTopCity = useCallback(
    (pick: TopCityPick) => {
      const next = new URLSearchParams(searchParams);
      next.set("residenceCity", pick.city);
      next.set("residenceCountry", pick.country);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const clearPlaceFilter = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("residenceCity");
    next.delete("residenceCountry");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  if (auth.status !== "authenticated") {
    return null;
  }

  if (loadStatus === "loading") {
    return (
      <div className="intent-page-shell">
        <Nav variant="home" />
        <div className="intent-page">
          <p className="body-text" style={{ color: "var(--ink-muted)", margin: 0 }}>
            Loading…
          </p>
        </div>
      </div>
    );
  }

  if (loadStatus === "error" || !authMyProfile) {
    return (
      <div className="intent-page-shell">
        <Nav variant="home" />
        <div className="intent-page">
          <p className="section-headline" style={{ marginBottom: 12 }}>
            Couldn’t load your profile
          </p>
        </div>
      </div>
    );
  }

  const displayName =
    authMyProfile.fullName?.trim() || navDisplayName(authMyProfile, auth.person.institutionalEmail);

  return (
    <div className="intent-page-shell">
      <Nav variant="home" avatarName={displayName} />

      <div className="home-dashboard">
        <section className="home-dashboard__hero" aria-labelledby="location-hero-heading">
          <div className="home-dashboard__hero-watermark" aria-hidden>
            IIT BHU
          </div>
          <div className="home-dashboard__hero-inner">
            <div className="home-dashboard__hero-left">
              <h1 id="location-hero-heading" className="home-dashboard__hero-title">
                Where are alumni living?
              </h1>
            </div>
          </div>
        </section>

        <div className="location-page location-page--intent">
          <div className="location-page__body">
            <aside className="location-page__sidebar" aria-label="Search and cities">
            <form className="location-page__search-form" onSubmit={handleSearchSubmit}>
              <label className="ui-label" htmlFor={searchFieldId}>
                Search by city or country
              </label>
              <input
                id={searchFieldId}
                type="search"
                className="input location-page__search-input"
                placeholder="e.g. London, Germany…"
                value={draft.q}
                onChange={(e) => setDraftPatch({ q: e.target.value })}
                autoComplete="off"
                enterKeyHint="search"
                aria-label="Search directory"
                maxLength={DIRECTORY_KEYWORD_MAX_LENGTH}
              />
              <div className="location-page__search-actions">
                {hasCommittedPlace ? (
                  <>
                    <button type="button" className="location-page__refine-link" onClick={clearPlaceFilter}>
                      Clear
                    </button>
                    {filterCountWithoutPlace > 0 ? (
                      <button type="button" className="location-page__refine-link" onClick={() => setFiltersOpen(true)}>
                        Filter
                        <span
                          className="directory-search-bar__badge"
                          aria-label={`${filterCountWithoutPlace} active filters`}
                        >
                          {filterCountWithoutPlace}
                        </span>
                      </button>
                    ) : null}
                  </>
                ) : (
                  <button type="button" className="location-page__refine-link" onClick={() => setFiltersOpen(true)}>
                    Filter
                    {filterCount > 0 ? (
                      <span className="directory-search-bar__badge" aria-label={`${filterCount} active filters`}>
                        {filterCount}
                      </span>
                    ) : null}
                  </button>
                )}
                <Button type="submit" variant="primary">
                  Search
                </Button>
              </div>
            </form>

            <p className="ui-label location-page__sidebar-list-label">Top cities</p>
            {topCitiesQuery.isLoading ? (
              <p className="body-text location-page__sidebar-muted">Loading top cities…</p>
            ) : sidebarTopCities && sidebarTopCities.length > 0 ? (
              <ul className="location-page__city-list">
                {sidebarTopCities.map((row) => {
                  const pick: TopCityPick = { city: row.city, country: row.country };
                  const active = cityPickMatchesDraft(pick, draft.residenceCity, draft.residenceCountry);
                  return (
                    <li key={`${row.city}-${row.country}`}>
                      <button
                        type="button"
                        className={`location-page__city-row${active ? " location-page__city-row--active" : ""}`}
                        onClick={() => pickTopCity(pick)}
                        aria-pressed={active ? true : undefined}
                        aria-label={
                          row.count > 0
                            ? `${row.city}, ${row.country} — ${row.count} alumni`
                            : `${row.city}, ${row.country}`
                        }
                      >
                        <span className="location-page__city-dot" aria-hidden />
                        <span className="location-page__city-name">{row.city}</span>
                        <span className="location-page__city-count">
                          {row.count > 0 ? row.count.toLocaleString() : "—"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="body-text location-page__sidebar-muted">No city data yet.</p>
            )}
            </aside>

            <div className="location-page__main">
            <section className="location-page__results" aria-label="People in this view">
              {wideningSummary ? (
                <div className="search-page__notice" role="status">
                  <p className="search-page__notice-text">{wideningSummary}</p>
                </div>
              ) : null}

              <div className="location-page__results-head">
                <p
                  className={`location-page__results-count${fetchingMain && !errorMessage ? " location-page__results-count--busy" : ""}`}
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
                          {results.length} profile{results.length !== 1 ? "s" : ""}
                          <span style={{ opacity: 0.75 }}> · updating…</span>
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      {results.length} profile{results.length !== 1 ? "s" : ""}
                      {hasActiveFilters ? " · filtered" : ""}
                    </>
                  )}
                </p>
                <Link to={fullDirectoryHref} className="location-page__directory-link">
                  Open in full directory →
                </Link>
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
                  <p className="section-headline" style={{ marginBottom: 8, color: "var(--brick)" }}>
                    Couldn’t load results
                  </p>
                  <p className="body-text" style={{ color: "var(--ink-muted)", margin: 0 }}>
                    {errorMessage}
                  </p>
                </div>
              ) : null}

              {!fetchingMain && !errorMessage && results.length === 0 ? (
                <div className="search-page__empty">
                  <p className="section-headline" style={{ marginBottom: 8 }}>
                    No alumni match yet
                  </p>
                  <p className="body-text" style={{ color: "var(--ink-muted)", margin: 0 }}>
                    Choose a <strong>top city</strong>, open <strong>Filter</strong>, add a keyword, then press{" "}
                    <strong>Search</strong>.
                  </p>
                </div>
              ) : null}

              {!errorMessage && results.length > 0 ? (
                <>
                  <div ref={resultsScrollRef} className="location-page__results-scroll">
                    <div
                      className="location-page__virtual-track"
                      style={{ height: virtualizer.getTotalSize(), position: "relative" }}
                    >
                      {virtualizer.getVirtualItems().map((vi) => {
                        const startIdx = vi.index * gridColumns;
                        const rowProfiles = results.slice(startIdx, startIdx + gridColumns);
                        return (
                          <div
                            key={vi.key}
                            data-index={vi.index}
                            ref={virtualizer.measureElement}
                            className="location-page__virtual-row"
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              transform: `translateY(${vi.start}px)`,
                            }}
                          >
                            <div className="location-page__grid" role="list">
                              {rowProfiles.map((p, colIdx) => {
                                const globalIndex = startIdx + colIdx;
                                return (
                                  <div key={p.id} role="listitem" className="location-page__grid-cell">
                                    <LocationDirectoryCard
                                      profile={p}
                                      resultIndex={globalIndex}
                                      searchSessionId={searchSessionId}
                                    />
                                  </div>
                                );
                              })}
                            </div>
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
            </section>
            </div>
          </div>

          <DirectoryFilterDrawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter">
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
        </div>
      </div>
    </div>
  );
}
