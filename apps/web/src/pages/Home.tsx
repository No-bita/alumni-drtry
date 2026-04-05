import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { Avatar } from "../components/Avatar";
import { useAuth } from "../contexts/AuthContext";
import { type MeOccupationsResponse, type MyProfileView, type SearchProfileView, type SearchResult } from "../api/client";
import { assertApiGet } from "../lib/assertApiGet";
import { queryKeys } from "../lib/queryKeys";
import { BulletinPanel } from "../components/BulletinPanel";
import { DirectorySearchBar } from "../components/DirectorySearchBar";
import { DirectoryFilterDrawer } from "../components/DirectoryFilterDrawer";
import { DirectoryFiltersForm } from "../components/DirectoryFiltersForm";
import { ConnectionThreadsList } from "../components/ConnectionThreadsList";
import { ContactRequestsInbox } from "../components/ContactRequestsInbox";
import { DIRECTORY_KEYWORD_MAX_LENGTH } from "../constants/directorySearch";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";

function displayFirstName(profile: MyProfileView, email: string | undefined): string {
  const fn = profile.fullName?.trim();
  if (fn) {
    const parts = fn.split(/\s+/);
    return parts[0] ?? fn;
  }
  return displayFirstNameFromEmail(email);
}

function firstNameFromFullName(fullName: string): string {
  const t = fullName.trim();
  if (!t) return "";
  return t.split(/\s+/)[0] ?? t;
}

/** Draft text for inviting classmates; share via any channel (those listed are already members — use for others you know). */
function buildBatchmateInviteMessage(row: SearchProfileView): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const loginUrl = `${origin}/login`;
  const first = firstNameFromFullName(row.fullName);
  const greeting = first ? `Hi ${first}` : "Hi";
  return `${greeting},\n\nI'm on the IIT BHU alumni platform. If you haven't joined yet, sign in with your @iitbhu.ac.in or @itbhu.ac.in email:\n${loginUrl}\n`;
}

function profileHeadline(row: SearchProfileView): string {
  const roleOrg = [row.headlineRoleTitle, row.headlineOrganizationName].filter(Boolean).join(" · ");
  if (roleOrg) return roleOrg;
  const dept = row.departmentName ?? "";
  const yr = row.batchYear != null ? String(row.batchYear) : "";
  return [dept, yr].filter(Boolean).join(" · ") || "IIT BHU alum";
}

function profileCompletionPercent(profile: MyProfileView, hasOccupation: boolean): number {
  let n = 0;
  if (profile.fullName?.trim()) n++;
  if (profile.departmentCode ?? profile.parsedDepartmentCode) n++;
  // if (profile.bio?.trim()) n++;
  if (hasOccupation) n++;
  if (profile.residenceCountry?.trim() || profile.residenceCity?.trim()) n++;
  if (profile.onboardingCompletedAt) n++;
  return Math.round((n / 5) * 100);
}

/**
 * Signed-in home (`/home`): hero, search, batch snapshot, bulletin, profile strength.
 * Route is protected by RequireAuth + RequireProfileComplete.
 */
export function Home() {
  const auth = useAuth();
  const authPersonId = auth.status === "authenticated" ? auth.person.personId : undefined;
  /** From AuthContext / shared session query — same payload ProfileGate uses (no duplicate /v1/me or /v1/me/profile). */
  const profile = auth.status === "authenticated" ? auth.myProfile : null;
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterBatch, setFilterBatch] = useState<number | "">("");
  const [filterDept, setFilterDept] = useState("");
  const [filterCompany, setFilterCompany] = useState("");
  const [filterOcc, setFilterOcc] = useState("");
  const [filterResidenceCountry, setFilterResidenceCountry] = useState("");
  const [filterResidenceCity, setFilterResidenceCity] = useState("");

  const [filtersOpen, setFiltersOpen] = useState(false);
  /** Brief feedback after Invite on a batch row. */
  const [batchInviteFeedback, setBatchInviteFeedback] = useState<{
    profileId: string;
    kind: "copied" | "shared";
  } | null>(null);

  const authenticated = auth.status === "authenticated";

  const occQuery = useQuery({
    queryKey: queryKeys.me.occupations(),
    queryFn: ({ signal }) => assertApiGet<MeOccupationsResponse>("/v1/me/occupations", signal),
    enabled: authenticated,
  });

  const profileBatchYear = profile?.batchYear ?? null;
  const profileDeptLower = (() => {
    const dc = profile?.departmentCode ?? profile?.parsedDepartmentCode;
    return dc ? dc.toLowerCase() : "";
  })();
  const batchSnapshotEnabled = Boolean(
    authenticated && authPersonId && profileBatchYear != null && profileDeptLower
  );

  const batchQuery = useQuery({
    queryKey: queryKeys.home.batchSnapshot(authPersonId ?? "", profileBatchYear ?? 0, profileDeptLower),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        batch: String(profileBatchYear),
        dept: profileDeptLower,
        limit: "100",
      });
      return assertApiGet<SearchResult>(`/v1/search?${params.toString()}`, signal);
    },
    enabled: batchSnapshotEnabled,
  });

  const hasCurrentOccupation = useMemo(
    () => (occQuery.data?.occupations ?? []).some((o) => o.isCurrent),
    [occQuery.data]
  );

  const batchMeta = useMemo(() => {
    if (!batchQuery.data || !authPersonId) return null;
    const others = batchQuery.data.results.filter((row) => row.id !== authPersonId);
    const hasMore = batchQuery.data.pageInfo.hasMore;
    const countLabel =
      others.length === 0
        ? "0"
        : hasMore && others.length >= 100
          ? "100+"
          : hasMore
            ? `${others.length}+`
            : String(others.length);
    return {
      countLabel,
      members: others,
      empty: others.length === 0,
    };
  }, [batchQuery.data, authPersonId]);

  useEffect(() => {
    if (!profile) return;
    if (profile.batchYear != null) setFilterBatch(profile.batchYear);
    const dc = profile.departmentCode ?? profile.parsedDepartmentCode;
    if (dc) setFilterDept(dc.toLowerCase());
  }, [profile]);

  const navigateToDirectorySearch = useCallback(() => {
    const params = new URLSearchParams();
    const q = searchQuery.trim().slice(0, DIRECTORY_KEYWORD_MAX_LENGTH);
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
    navigate
  ]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigateToDirectorySearch();
  };

  const homeFilterCount =
    (filterBatch !== "" ? 1 : 0) +
    (filterDept ? 1 : 0) +
    (filterCompany.trim() ? 1 : 0) +
    (filterOcc ? 1 : 0) +
    (filterResidenceCountry.trim() ? 1 : 0) +
    (filterResidenceCity.trim() ? 1 : 0);

  const homeHasActiveFilters =
    filterBatch !== "" ||
    !!filterDept ||
    !!filterCompany.trim() ||
    !!filterOcc ||
    !!filterResidenceCountry.trim() ||
    !!filterResidenceCity.trim() ||
    !!searchQuery.trim();

  const clearHomeFilters = () => {
    setSearchQuery("");
    setFilterBatch("");
    setFilterDept("");
    setFilterCompany("");
    setFilterOcc("");
    setFilterResidenceCountry("");
    setFilterResidenceCity("");
    setFiltersOpen(false);
  };

  const inviteBatchmate = useCallback(async (row: SearchProfileView) => {
    const text = buildBatchmateInviteMessage(row);
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "IIT BHU alumni platform",
          text,
        });
        setBatchInviteFeedback({ profileId: row.id, kind: "shared" });
        window.setTimeout(() => setBatchInviteFeedback(null), 2500);
        return;
      } catch (e) {
        const err = e as { name?: string };
        if (err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setBatchInviteFeedback({ profileId: row.id, kind: "copied" });
      window.setTimeout(() => setBatchInviteFeedback(null), 2500);
    } catch {
      window.prompt("Copy this invite:", text);
    }
  }, []);

  const pageLoading =
    Boolean(authenticated && profile && occQuery.isPending) ||
    Boolean(batchSnapshotEnabled && batchQuery.isPending);

  if (pageLoading) {
    return (
      <>
        <Nav variant="home" />
        <div style={{ padding: "4rem var(--page-x)", textAlign: "center", background: "var(--home-sand)", flex: 1 }}>
          <p className="body-text" style={{ color: "var(--ink-muted)" }}>
            Loading…
          </p>
        </div>
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <Nav variant="home" />
        <div style={{ padding: "4rem var(--page-x)", textAlign: "center", maxWidth: 420, margin: "0 auto" }}>
          <p className="section-headline" style={{ marginBottom: 12 }}>
            Couldn’t load your profile
          </p>
          <p className="body-text" style={{ color: "var(--ink-muted)", marginBottom: 24 }}>
            Refresh the page or try signing in again.
          </p>
          <Link to="/login">
            <Button variant="primary">Sign in</Button>
          </Link>
        </div>
      </>
    );
  }

  const firstName = displayFirstName(
    profile,
    auth.status === "authenticated" ? auth.person.institutionalEmail : undefined
  );
  const batchYear = profile.batchYear;
  const deptCodeRaw = profile.departmentCode ?? profile.parsedDepartmentCode;
  const deptCodeForTitle = (deptCodeRaw ?? "").toUpperCase();
  /** Prefer API department name; fall back to uppercase code. */
  const deptForBatchHeading =
    profile.departmentName?.trim() ||
    profile.parsedDepartmentName?.trim() ||
    (deptCodeRaw ? deptCodeForTitle : "");
  const hasBatchDept = batchYear != null && !!deptCodeRaw;
  const batchTitle =
    batchYear != null && deptForBatchHeading
      ? `${deptForBatchHeading} ${batchYear}`
      : batchYear != null
        ? String(batchYear)
        : "Your batch";

  const completion = profileCompletionPercent(profile, hasCurrentOccupation);
  const displayName = profile.fullName?.trim() || firstName;
  const stackShown = batchMeta?.members.slice(0, 5) ?? [];
  const stackExtra =
    batchMeta && batchMeta.members.length > 5 ? batchMeta.members.length - 5 : 0;
  const batchList = batchMeta?.members.slice(0, 3) ?? [];

  return (
    <>
      <Nav variant="home" avatarName={displayName} />
      <div className="home-dashboard">
        <section className="home-dashboard__hero" aria-labelledby="home-hero-heading">
          <div className="home-dashboard__hero-watermark" aria-hidden>
            IIT BHU
          </div>
          <div className="home-dashboard__hero-inner">
            <div className="home-dashboard__hero-left">
              <h1 id="home-hero-heading" className="home-dashboard__hero-title">
                Hi, {firstName}
              </h1>
            </div>
            {batchMeta && !batchMeta.empty ? (
              <div className="home-dashboard__hero-stat" aria-label="Batch members on the platform">
                <span className="home-dashboard__hero-stat-num">{batchMeta.countLabel}</span>
                <span className="home-dashboard__hero-stat-label">From your batch</span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="home-dashboard__search-band" aria-labelledby="home-search-label">
          <span id="home-search-label" className="visually-hidden">
            Alumni directory search
          </span>
          <DirectorySearchBar
            variant="home"
            keyword={searchQuery}
            onKeywordChange={setSearchQuery}
            onSubmit={handleSearchSubmit}
            filterCount={homeFilterCount}
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
              onClearAll={homeHasActiveFilters ? clearHomeFilters : undefined}
              onSearch={() => {
                navigateToDirectorySearch();
                setFiltersOpen(false);
              }}
            />
          </DirectoryFilterDrawer>
        </section>

        <div className="home-dashboard__main">
          <div className="home-dashboard__col home-dashboard__col--wide">
            <article className="home-dashboard__card">
              <header className="home-dashboard__card-head">
                <h2 className="home-dashboard__card-kicker">{batchTitle}</h2>
                {batchMeta && !batchMeta.empty ? (
                  <Link to="/search" className="home-dashboard__text-link">
                    See all →
                  </Link>
                ) : null}
              </header>
              {hasBatchDept ? (
                auth.status !== "authenticated" ? (
                  <p className="body-text" style={{ color: "var(--ink-muted)" }}>
                    Unable to load your account. Refresh the page to see classmates from your batch.
                  </p>
                ) : batchMeta && !batchMeta.empty ? (
                  <>
                    <p className="home-dashboard__batch-summary">
                      <span className="home-dashboard__batch-summary-strong">{batchMeta.countLabel} batchmates</span> are
                      here
                    </p>
                    <div className="home-dashboard__avatar-stack">
                      {stackShown.map((row) => (
                        <Link
                          key={row.id}
                          to={`/profiles/${row.id}`}
                          className="home-dashboard__avatar-stack-link"
                          title={row.fullName}
                        >
                          <Avatar name={row.fullName} size="sm" tone="pastel" />
                        </Link>
                      ))}
                      {stackExtra > 0 ? (
                        <span className="home-dashboard__avatar-more" title={`${stackExtra} more`}>
                          +{stackExtra}
                        </span>
                      ) : null}
                    </div>
                    <p className="home-dashboard__batch-invite-hint body-text" style={{ color: "var(--ink-muted)", margin: "0 0 var(--space-sm)" }}>
                      Know batchmates who are not here yet? Use <strong>Invite</strong> to copy a message with the sign-in link.
                    </p>
                    <ul className="home-dashboard__batch-list">
                      {batchList.map((row) => (
                        <li key={row.id} className="home-dashboard__batch-item">
                          <Link to={`/profiles/${row.id}`} className="home-dashboard__batch-row">
                            <Avatar name={row.fullName} size="sm" tone="pastel" />
                            <div>
                              <span className="home-dashboard__batch-name">{row.fullName}</span>
                              <span className="home-dashboard__batch-role">{profileHeadline(row)}</span>
                            </div>
                          </Link>
                          <button
                            type="button"
                            className="home-dashboard__batch-invite"
                            onClick={() => void inviteBatchmate(row)}
                            aria-label={`Invite or share draft for ${row.fullName}`}
                            title="Copy a draft invite message with the sign-in link (for classmates not on the platform yet)"
                          >
                            {batchInviteFeedback?.profileId === row.id
                              ? batchInviteFeedback.kind === "shared"
                                ? "Shared"
                                : "Copied"
                              : "Invite"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : batchMeta?.empty ? (
                  <p className="body-text" style={{ color: "var(--ink-muted)" }}>
                    No other alumni from your batch are visible yet — try the directory or broaden filters.
                  </p>
                ) : (
                  <p className="body-text" style={{ color: "var(--ink-muted)" }}>
                    Loading batch snapshot…
                  </p>
                )
              ) : (
                <p className="body-text" style={{ color: "var(--ink-muted)" }}>
                  Add your batch and department on your profile to see classmates here.
                </p>
              )}
            </article>
          </div>

          <aside className="home-dashboard__col home-dashboard__col--side">
            <ConnectionThreadsList />
            <ContactRequestsInbox />
            <BulletinPanel feedReady />

            <section
              className={`home-dashboard__profile-card${completion >= 100 ? " home-dashboard__profile-card--done" : ""}`}
              aria-labelledby="home-profile-card-heading"
            >
              <h2 id="home-profile-card-heading" className="home-dashboard__profile-card-title">
                Profile · {completion}% complete
              </h2>
              <div className="progress-bar home-dashboard__profile-progress">
                <div className="progress-bar__fill" style={{ width: `${completion}%` }} />
              </div>
              {!hasCurrentOccupation ? (
                <p className="home-dashboard__profile-hint">
                  Add your current occupation to appear in more searches and get better matches.
                </p>
              ) : !profile.onboardingCompletedAt ? (
                <p className="home-dashboard__profile-hint">
                  Finish onboarding (contact & links) to complete your profile.
                </p>
              ) : (
                <p className="home-dashboard__profile-hint">Your profile looks strong. Keep it updated as you grow.</p>
              )}
              <Link to={`/profiles/${profile.id}`} className="home-dashboard__text-link home-dashboard__text-link--caps">
                Complete profile →
              </Link>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
