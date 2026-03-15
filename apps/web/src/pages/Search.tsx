import { useEffect, useState } from "react";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { Chip } from "../components/Chip";
import { SearchResultCard } from "../components/SearchResultCard";
import { api, type SearchResult, type SearchProfileView } from "../api/client";
import { Avatar } from "../components/Avatar";
import { DEPARTMENTS } from "../constants/departments";
import { CAMPUS_IMAGE_SMALL } from "../constants/images";

const BATCH_YEARS = [2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013];

export function Search() {
  const [results, setResults] = useState<SearchProfileView[]>([]);
  const [pageInfo, setPageInfo] = useState<{ hasMore: boolean; nextCursor: string | null }>({ hasMore: false, nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [batchYear, setBatchYear] = useState<number | null>(null);
  const [departmentCode, setDepartmentCode] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");

  const buildParams = (cursor?: string | null) => {
    const params = new URLSearchParams();
    if (batchYear != null) params.set("batchYear", String(batchYear));
    if (departmentCode) params.set("departmentCode", departmentCode);
    if (keyword.trim()) params.set("keyword", keyword.trim());
    params.set("limit", "20");
    if (cursor) params.set("cursor", cursor);
    return params;
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const params = buildParams();
      const { data } = await api.get<SearchResult>(`/v1/search?${params.toString()}`);
      if (!cancelled && data) {
        setResults(data.results ?? []);
        setPageInfo(data.pageInfo ?? { hasMore: false, nextCursor: null });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [batchYear, departmentCode, keyword]);

  const loadMore = async () => {
    if (!pageInfo.nextCursor || loadingMore) return;
    setLoadingMore(true);
    const params = buildParams(pageInfo.nextCursor);
    const { data } = await api.get<SearchResult>(`/v1/search?${params.toString()}`);
    if (data) {
      setResults((prev) => [...prev, ...(data.results ?? [])]);
      setPageInfo(data.pageInfo ?? { hasMore: false, nextCursor: null });
    }
    setLoadingMore(false);
  };

  return (
    <>
      <Nav right={<Avatar name="You" size="sm" />} />
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "calc(100vh - var(--nav-height))" }}>
        <aside
          style={{
            background: "var(--surface)",
            borderRight: "var(--border-default)",
            padding: "var(--space-lg) var(--page-x)",
          }}
        >
          <div className="ui-label" style={{ marginBottom: 12 }}>Filters</div>
          <div style={{ marginBottom: 20 }}>
            <input
              type="search"
              placeholder="Search by name, role…"
              className="input"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ marginBottom: 8 }}
            />
          </div>
          <div className="section-divider">
            <span className="section-divider__text">Batch</span>
            <span className="section-divider__line" />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {BATCH_YEARS.map((y) => (
              <Chip
                key={y}
                size="sm"
                active={batchYear === y}
                onClick={() => setBatchYear(batchYear === y ? null : y)}
              >
                {y}
              </Chip>
            ))}
          </div>
          <div className="section-divider">
            <span className="section-divider__text">Department</span>
            <span className="section-divider__line" />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {DEPARTMENTS.map((d) => (
              <Chip
                key={d.code}
                size="sm"
                active={departmentCode === d.code}
                onClick={() => setDepartmentCode(departmentCode === d.code ? null : d.code)}
              >
                {d.label}
              </Chip>
            ))}
          </div>
        </aside>
        <main>
          <header
            style={{
              background: "var(--surface)",
              padding: "1.5rem var(--page-x)",
              borderBottom: "var(--border-default)",
            }}
          >
            <span className="ui-body">
              {loading ? "Loading…" : `${results.length} result${results.length !== 1 ? "s" : ""}`}
            </span>
          </header>
          {!loading && results.length === 0 ? (
            <div
              style={{
                padding: "3rem var(--page-x)",
                textAlign: "center",
                color: "var(--ink-muted)",
              }}
            >
              <p className="section-headline" style={{ marginBottom: 8, color: "var(--ink)" }}>
                No alumni match your filters
              </p>
              <p className="body-text">
                Try adjusting batch or department, or search by name or role.
              </p>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: 16,
                  padding: "var(--page-x)",
                  position: "relative",
                  minHeight: 200,
                }}
              >
                {results.map((profile, i) => (
                  <SearchResultCard
                    key={profile.id}
                    profile={profile}
                    style={{ animationDelay: `${i * 50}ms` }}
                  />
                ))}
              </div>
              {pageInfo.hasMore && pageInfo.nextCursor && (
                <div style={{ padding: "1.5rem var(--page-x)", textAlign: "center" }}>
                  <Button
                    variant="secondary"
                    onClick={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
          <div
            style={{
              width: "100%",
              height: 120,
              background: "linear-gradient(to top, var(--cream), transparent)",
              backgroundSize: "cover",
              backgroundImage: `url(${CAMPUS_IMAGE_SMALL})`,
              opacity: 0.25,
              marginTop: 24,
            }}
          />
        </main>
      </div>
    </>
  );
}
