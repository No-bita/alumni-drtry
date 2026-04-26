import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { Avatar } from "../components/Avatar";
import { useAuth } from "../contexts/AuthContext";
import { type MyProfileView, type SearchProfileView, type SearchResult } from "../api/client";
import { assertApiGet } from "../lib/assertApiGet";
import { queryKeys } from "../lib/queryKeys";
import { BulletinPanel } from "../components/BulletinPanel";
import { CampusMonthlyDigestSection } from "../components/CampusMonthlyDigestSection";
import { ContactRequestsInbox } from "../components/ContactRequestsInbox";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";
import { isDemoProfileBio } from "../lib/demoProfile";

function displayFirstName(profile: MyProfileView, email: string | undefined): string {
  const fn = profile.fullName?.trim();
  if (fn) {
    const parts = fn.split(/\s+/);
    return parts[0] ?? fn;
  }
  return displayFirstNameFromEmail(email);
}

/** Role and employer from directory headline (platform data only). */
function batchmateRoleLine(row: SearchProfileView): string | null {
  const r = row.headlineRoleTitle?.trim();
  const o = row.headlineOrganizationName?.trim();
  if (r && o) return `${r} · ${o}`;
  if (r) return r;
  if (o) return o;
  return null;
}

/** Residence city and country when present on the profile. */
function batchmateLocationLine(row: SearchProfileView): string | null {
  const city = row.residenceCity?.trim();
  const country = row.residenceCountry?.trim();
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;
  return null;
}

function DashboardStateMessage({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="home-dashboard__state-block" role="status" aria-live="polite">
      <p className="home-dashboard__state-title">{title}</p>
      <p className="home-dashboard__state-copy">{description}</p>
      {action ? <div className="home-dashboard__state-action">{action}</div> : null}
    </div>
  );
}

/*
function profileCompletionPercent(profile: MyProfileView, hasOccupation: boolean): number {
  let n = 0;
  if (profile.fullName?.trim()) n++;
  if (profile.departmentCode ?? profile.parsedDepartmentCode) n++;
  if (hasOccupation) n++;
  if (profile.residenceCountry?.trim() || profile.residenceCity?.trim()) n++;
  if (profile.onboardingCompletedAt) n++;
  return Math.round((n / 5) * 100);
}
*/

/**
 * Signed-in home (`/home`): hero, batch snapshot, bulletin.
 * Route is protected by RequireAuth + RequireProfileComplete.
 */
export function Home() {
  const auth = useAuth();
  const authPersonId = auth.status === "authenticated" ? auth.person.personId : undefined;
  /** From AuthContext / shared session query — same payload ProfileGate uses (no duplicate /v1/me or /v1/me/profile). */
  const profile = auth.status === "authenticated" ? auth.myProfile : null;

  const authenticated = auth.status === "authenticated";

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

  /*
  const hasCurrentOccupation = useMemo(
    () => (occQuery.data?.occupations ?? []).some((o) => o.isCurrent),
    [occQuery.data]
  );
  const completion = profileCompletionPercent(profile, hasCurrentOccupation);
  */

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

  /** Same filters as the home batch snapshot — directory opens scoped to this cohort. */
  const batchDirectorySearchHref = useMemo(() => {
    const params = new URLSearchParams();
    if (profileBatchYear != null) params.set("batch", String(profileBatchYear));
    if (profileDeptLower) params.set("dept", profileDeptLower);
    const qs = params.toString();
    return qs ? `/search?${qs}` : "/search";
  }, [profileBatchYear, profileDeptLower]);

  /** Match bulletin column height to the Your Batch card (ResizeObserver; no inner batch scroll). */
  const batchSectionRef = useRef<HTMLElement>(null);
  const [batchSectionHeightPx, setBatchSectionHeightPx] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = batchSectionRef.current;
    if (!el) return;
    const sync = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      setBatchSectionHeightPx(Number.isFinite(h) && h > 0 ? h : null);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  const feedRowStyle: CSSProperties | undefined =
    batchSectionHeightPx != null
      ? ({ "--home-batch-section-height": `${batchSectionHeightPx}px` } as CSSProperties)
      : undefined;

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

  const displayName = profile.fullName?.trim() || firstName;
  const needsContactNudge = !profile.residenceCountry?.trim() || !profile.mobilePhone?.trim();
  /** Preview grid: two columns, up to 6 profiles (compact cards). */
  const batchList = batchMeta?.members.slice(0, 6) ?? [];

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
              <div className="home-dashboard__hero-actions">
                <Link to={batchDirectorySearchHref} className="home-dashboard__hero-primary-action">
                  Explore alumni
                </Link>
              </div>
            </div>
          </div>
        </section>

        <div className="home-dashboard__toolbar">
          <ContactRequestsInbox />
          {needsContactNudge ? (
            <section className="home-dashboard__profile-nudge" aria-labelledby="home-profile-nudge-heading">
              <h2 id="home-profile-nudge-heading" className="home-dashboard__profile-nudge-title">
                Complete your profile
              </h2>
              <p className="home-dashboard__profile-nudge-copy">
                Add your residence city/country and mobile number so alumni can connect with you faster.
              </p>
              <Link
                to={`/profiles/${profile.id}?edit=contact`}
                className="home-dashboard__text-link home-dashboard__text-link--caps"
              >
                Add contact details →
              </Link>
            </section>
          ) : null}
          {/*
          Profile completion nudge — disabled until layout/copy is reworked.
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
          */}
        </div>

        <div className="home-dashboard__main home-dashboard__main--feed-row" style={feedRowStyle}>
          <div className="home-dashboard__col home-dashboard__col--wide home-dashboard__col--batch-secondary">
            <section
              ref={batchSectionRef}
              className="home-dashboard__batch"
              aria-labelledby="home-batch-heading"
            >
              <div className="home-dashboard__surface-panel">
                <header
                  className={`home-dashboard__surface-header${batchMeta && !batchMeta.empty ? " home-dashboard__surface-header--split" : ""}`}
                >
                  <div className="home-dashboard__surface-header-main">
                    <h2 id="home-batch-heading" className="home-dashboard__surface-title">
                      Your Batch
                    </h2>
                  </div>
                  {batchMeta && !batchMeta.empty ? (
                    <Link to={batchDirectorySearchHref} className="home-dashboard__text-link">
                      See all →
                    </Link>
                  ) : null}
                </header>
                <div className="home-dashboard__batch-body">
                  {hasBatchDept ? (
                    auth.status !== "authenticated" ? (
                      <DashboardStateMessage
                        title="Session not available"
                        description="Refresh and try again to see batchmates from your cohort."
                        action={
                          <Link to="/login" className="home-dashboard__text-link">
                            Sign in again →
                          </Link>
                        }
                      />
                    ) : batchMeta && !batchMeta.empty ? (
                      <>
                        <p className="home-dashboard__batch-summary">
                          <span className="home-dashboard__batch-summary-strong">{batchMeta.countLabel} batchmates</span> are
                          here
                        </p>
                        <ul className="home-dashboard__batch-grid" role="list">
                          {batchList.map((row) => {
                            const roleLine = batchmateRoleLine(row);
                            const locationLine = batchmateLocationLine(row);
                            const isDemo = isDemoProfileBio(row.bio);
                            return (
                              <li key={row.id} className="home-dashboard__batch-item">
                                <Link
                                  to={`/profiles/${row.id}`}
                                  className="home-dashboard__batch-card home-dashboard__batch-card--compact"
                                >
                                  <span className="home-dashboard__batch-card-avatar">
                                    <Avatar
                                      name={row.fullName}
                                      size="sm"
                                      tone="pastel"
                                      departmentCode={row.departmentCode ?? row.parsedDepartmentCode}
                                    />
                                  </span>
                                  <span className="home-dashboard__batch-card-body">
                                    <span className="home-dashboard__batch-name">
                                      {row.fullName}
                                      {isDemo ? (
                                        <span className="badge badge--hiring home-dashboard__demo-badge">Demo</span>
                                      ) : null}
                                    </span>
                                    {roleLine ? (
                                      <span className="home-dashboard__batch-meta">{roleLine}</span>
                                    ) : null}
                                    {locationLine ? (
                                      <span className="home-dashboard__batch-location">{locationLine}</span>
                                    ) : null}
                                  </span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                        <div className="home-dashboard__batch-cta">
                          <p className="home-dashboard__batch-cta-line">
                            Your batch is just the beginning.{" "}
                            <Link to="/search" className="home-dashboard__text-link">
                              Search all alumni →
                            </Link>
                          </p>
                        </div>
                      </>
                    ) : batchMeta?.empty ? (
                      <div className="home-dashboard__batch-empty">
                        <p className="home-dashboard__batch-empty-text">
                          <span className="home-dashboard__batch-empty-cohort">{batchTitle}</span>
                          <span className="home-dashboard__batch-empty-sub">
                            Be the first to bring your batch here by inviting classmates to join the platform.
                          </span>
                        </p>
                        <p className="home-dashboard__batch-empty-foot">
                          Share IIT BHU Alumni with your cohort so your batch network can start growing here.{" "}
                          <Link to="/search" className="home-dashboard__text-link">
                            Explore existing alumni
                          </Link>
                          .
                        </p>
                      </div>
                    ) : (
                      <div className="home-dashboard__batch-loading" aria-label="Loading batch snapshot">
                        <span className="home-dashboard__skeleton home-dashboard__skeleton--line home-dashboard__skeleton--line-lg" />
                        <span className="home-dashboard__skeleton home-dashboard__skeleton--line" />
                        <span className="home-dashboard__skeleton home-dashboard__skeleton--line home-dashboard__skeleton--line-sm" />
                        <span className="home-dashboard__skeleton home-dashboard__skeleton--card" />
                        <span className="home-dashboard__skeleton home-dashboard__skeleton--card" />
                      </div>
                    )
                  ) : (
                    <DashboardStateMessage
                      title="Add your cohort details"
                      description="Set your batch year and department so we can surface your closest alumni circle."
                      action={
                        <Link
                          to={`/profiles/${profile.id}?edit=education`}
                          className="home-dashboard__text-link"
                        >
                          Update profile →
                        </Link>
                      }
                    />
                  )}
                </div>
              </div>
            </section>
          </div>

          <aside className="home-dashboard__col home-dashboard__col--side home-dashboard__col--feed-only home-dashboard__col--bulletin-primary">
            <div className="home-dashboard__bulletin-grow">
              <BulletinPanel feedReady caption="" hideComposeCta />
            </div>
          </aside>
        </div>

        <CampusMonthlyDigestSection />
      </div>
    </>
  );
}
