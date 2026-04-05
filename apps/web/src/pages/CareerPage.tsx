import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, NavLink, useNavigate, useParams } from "react-router-dom";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { DirectorySearchBar } from "../components/DirectorySearchBar";
import { DirectoryFilterDrawer } from "../components/DirectoryFilterDrawer";
import { DirectoryFiltersForm } from "../components/DirectoryFiltersForm";
import {
  BulletinPanel,
  type BulletinFeedMeta,
  type BulletinPanelHandle,
} from "../components/BulletinPanel";
import { useAuth } from "../contexts/AuthContext";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";
import {
  careerIntentPath,
  isCareerTabSegment,
  type CareerTabSegment,
} from "../constants/careerTabs";

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

function yourHiringPostsHeadline(meta: BulletinFeedMeta): string {
  if (meta.status === "loading") return "Loading your posts…";
  if (meta.status === "error") return "Couldn’t load your posts";
  if (meta.loadedCount === 0) return "Your hiring posts";
  if (meta.mayHaveMore) return `${meta.loadedCount}+ hiring posts`;
  return meta.loadedCount === 1 ? "1 hiring post" : `${meta.loadedCount} hiring posts`;
}

/**
 * Career hub: hero + tabs (opportunities / referrals / post). Referrals tab includes inline directory search.
 */
export function CareerPage() {
  const auth = useAuth();
  const navigate = useNavigate();
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
  const [careerPostComposeOpen, setCareerPostComposeOpen] = useState(false);

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
    if (p.batchYear != null) setFilterBatch(p.batchYear);
    const dc = p.departmentCode ?? p.parsedDepartmentCode;
    if (dc) setFilterDept(dc.toLowerCase());
  }, [auth]);

  const navigateToDirectorySearch = useCallback(() => {
    const params = new URLSearchParams();
    const q = searchQuery.trim();
    if (q) params.set("q", q);
    if (filterBatch !== "") params.set("batch", String(filterBatch));
    if (filterDept) params.set("dept", filterDept);
    if (filterCompany.trim()) params.set("company", filterCompany.trim());
    if (filterOcc) params.set("occ", filterOcc);
    if (filterResidenceCountry.trim()) params.set("residenceCountry", filterResidenceCountry.trim());
    if (filterResidenceCity.trim()) params.set("residenceCity", filterResidenceCity.trim());
    const qs = params.toString();
    navigate(qs ? `/search?${qs}` : "/search");
  }, [
    searchQuery,
    filterBatch,
    filterDept,
    filterCompany,
    filterOcc,
    filterResidenceCountry,
    filterResidenceCity,
    navigate,
  ]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigateToDirectorySearch();
  };

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
  };

  const displayName = useMemo(() => {
    if (auth.status !== "authenticated") return "";
    return (
      auth.myProfile?.fullName?.trim() ||
      navDisplayName(auth.myProfile ?? undefined, auth.person.institutionalEmail)
    );
  }, [auth]);

  useEffect(() => {
    if (careerTabParam !== "post") setCareerPostComposeOpen(false);
  }, [careerTabParam]);

  if (auth.status !== "authenticated") {
    return null;
  }

  if (!isCareerTabSegment(careerTabParam)) {
    return <Navigate to={careerIntentPath("opportunities")} replace />;
  }
  const tab: CareerTabSegment = careerTabParam;

  return (
    <div className="intent-page-shell">
      <Nav variant="home" avatarName={displayName} />
      <div className="career-page">
        <header className="career-page__hero">
          <h1 className="career-page__hero-title">Where IIT BHU alumni hire, work, and grow.</h1>
          <div className="career-page__tabs" role="tablist" aria-label="Career hub">
            <NavLink
              to={careerIntentPath("opportunities")}
              role="tab"
              id="career-tab-opportunities"
              aria-selected={tab === "opportunities"}
              className={({ isActive }) =>
                `career-page__tab${isActive ? " career-page__tab--active" : ""}`.trim()
              }
            >
              <span className="career-page__tab-kicker">Looking for work</span>
              <span className="career-page__tab-label">Opportunities</span>
              <span className="career-page__tab-desc">Roles and openings shared by alumni on the bulletin.</span>
            </NavLink>
            <NavLink
              to={careerIntentPath("referrals")}
              role="tab"
              id="career-tab-referrals"
              aria-selected={tab === "referrals"}
              className={({ isActive }) =>
                `career-page__tab${isActive ? " career-page__tab--active" : ""}`.trim()
              }
            >
              <span className="career-page__tab-kicker">Need a referral</span>
              <span className="career-page__tab-label">Referrals</span>
              <span className="career-page__tab-desc">Find people by company, role, or batch in the alumni directory.</span>
            </NavLink>
            <NavLink
              to={careerIntentPath("post")}
              role="tab"
              id="career-tab-post"
              aria-selected={tab === "post"}
              className={({ isActive }) =>
                `career-page__tab${isActive ? " career-page__tab--active" : ""}`.trim()
              }
            >
              <span className="career-page__tab-kicker">Hiring now</span>
              <span className="career-page__tab-label">Post a role</span>
              <span className="career-page__tab-desc">Share a short hiring post so interested alumni can reply.</span>
            </NavLink>
          </div>
        </header>

        <div className="career-page__body">
          {/* Do not mount bulletin on Referrals — a hidden subtree still blocked the directory bar in some browsers. */}
          {tab === "opportunities" || tab === "post" ? (
            <div className="career-page__feed-anchor">
              <section
                className={`career-page__main${tab === "post" ? " career-page__main--post-tab" : ""}`}
                aria-labelledby={tab === "post" ? "career-post-heading" : "career-openings-heading"}
              >
                {tab === "opportunities" ? (
                  <div className="career-page__listings-head">
                    <h2 id="career-openings-heading" className="career-page__openings-title">
                      {openRolesHeadline(feedMeta)}
                    </h2>
                  </div>
                ) : null}
                {tab === "post" ? (
                  careerPostComposeOpen ? (
                    <h2 id="career-post-heading" className="visually-hidden">
                      Post a hiring update
                    </h2>
                  ) : (
                    <>
                      <h2 id="career-post-heading" className="career-page__panel-title">
                        Post a hiring update
                      </h2>
                      <p className="career-page__panel-copy body-text">
                        Add a short <strong>Hiring</strong> bulletin post. Interested alumni can reply from{" "}
                        <strong>Opportunities</strong>. Your posts and replies appear below.
                      </p>
                      <div className="career-page__post-compose-intro">
                        <Button type="button" variant="primary" onClick={() => bulletinRef.current?.openCompose()}>
                          Compose hiring post
                        </Button>
                      </div>
                      <div className="career-page__listings-head career-page__listings-head--after-compose">
                        <p className="career-page__openings-title career-page__openings-title--mine" role="status">
                          {yourHiringPostsHeadline(feedMeta)}
                        </p>
                      </div>
                    </>
                  )
                ) : null}
                <BulletinPanel
                  ref={bulletinRef}
                  feedReady={feedReady}
                  showFeed={tab === "opportunities" || tab === "post"}
                  hideComposeCta={tab === "post"}
                  feedMine={tab === "post"}
                  feedAuthorHistory={tab === "post"}
                  feedExcludeAuthorSoftDeleted={tab === "opportunities"}
                  showInlineAuthorReplies={tab === "post"}
                  feedDisableAutoScroll={tab === "post"}
                  lockedCategoryFilter="hiring"
                  domIdPrefix="career-bulletin"
                  showPanelHeader={false}
                  layout="career"
                  composePlacement={tab === "post" ? "panelStart" : "panelEnd"}
                  onComposeOpenChange={tab === "post" ? setCareerPostComposeOpen : undefined}
                  onFeedMetaChange={tab === "opportunities" || tab === "post" ? onFeedMetaChange : undefined}
                />
              </section>
            </div>
          ) : null}

          {tab === "referrals" ? (
            <section className="career-page__main career-page__main--referrals" aria-labelledby="career-referrals-heading">
              <h2 id="career-referrals-heading" className="career-page__panel-title">
                Find someone for a referral
              </h2>
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
                      navigateToDirectorySearch();
                      setFiltersOpen(false);
                    }}
                  />
                </DirectoryFilterDrawer>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
