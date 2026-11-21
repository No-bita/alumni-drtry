import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import "../styles/careers.css";
import { CareersFeedback } from "../components/CareersFeedback";
import { Nav } from "../components/Nav";
import { DeptBatchMeta } from "../components/DeptBatchMeta";
import { PostRoleHiringFlow, type PostRoleHiringFlowHandle } from "../components/PostRoleHiringFlow";
import type { IntentcastFeedResponse } from "../api/client";
import { HubSideCard } from "../components/HubSideCard";
import { LineIcon as Icon } from "../components/LineIcon";
import { ReachoutsWaitingCard } from "../components/ReachoutsWaitingCard";
import { YourReachoutsCard } from "../components/YourReachoutsCard";
import { WallShareButton } from "../components/WallShareButton";
import { useAuth } from "../contexts/AuthContext";
import { assertApiGet } from "../lib/assertApiGet";
import { publicAsset } from "../lib/appBase";
import { mapIntentcastToRow } from "../lib/careerFeedRow";
import {
  CAREER_HELP_TOPICS,
  askWithQuestionPath,
  careersCompanyPath,
  careersKeys,
  fetchReferralCompanies,
} from "../lib/careers";
import { MATCH_QUESTION_MAX, MATCH_QUESTION_MIN } from "../lib/matchApi";
import { queryKeys } from "../lib/queryKeys";
import { browsingLimitFromError } from "../lib/browsingLimits";

/** How many roles show before "View all jobs". */
const ROLES_PREVIEW = 4;
/** How many referral companies show before "See all". */
const COMPANIES_PREVIEW = 5;
const HERO_IMAGE = publicAsset("login-hero-house.jpg");

/**
 * Careers (/intent/career). Search opens Ask; shortcuts open Ask on a topic. "Opportunities for you"
 * lists roles alumni posted (no outside listings). The side column holds your reachouts, asks waiting
 * for you (people who can help) and quick links for everyone. Sections that would be empty stay hidden.
 */
export function CareerPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const searchId = useId();
  const hiringFlowRef = useRef<PostRoleHiringFlowHandle>(null);
  const [question, setQuestion] = useState("");
  const [showAllRoles, setShowAllRoles] = useState(false);
  const [companiesOpen, setCompaniesOpen] = useState(false);
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const signedIn = auth.status === "authenticated";

  const companies = useQuery({
    queryKey: careersKeys.referralCompanies(),
    queryFn: ({ signal }) => fetchReferralCompanies(signal),
    enabled: signedIn,
  });
  const rolesFeed = useQuery({
    queryKey: queryKeys.career.roles(),
    queryFn: ({ signal }) =>
      assertApiGet<IntentcastFeedResponse>("/v1/intentcasts?limit=48&offset=0&excludeAuthorSoftDeleted=true&category=hiring", signal),
    enabled: signedIn,
  });

  const roles = useMemo(
    () =>
      (rolesFeed.data?.intentcasts ?? [])
        .filter((p) => p.category === "hiring")
        .map((p) => ({ item: p, row: mapIntentcastToRow(p) }))
        .flatMap((x) => (x.row ? [{ item: x.item, row: x.row }] : [])),
    [rolesFeed.data],
  );

  if (!signedIn) return null;

  const displayName = auth.myProfile?.fullName?.trim() || undefined;
  const shownRoles = showAllRoles ? roles : roles.slice(0, ROLES_PREVIEW);
  const companyList = companies.data ?? [];
  const shownCompanies = showAllCompanies ? companyList : companyList.slice(0, COMPANIES_PREVIEW);
  const canSearch = question.trim().length >= MATCH_QUESTION_MIN;

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    if (!canSearch) return;
    navigate(askWithQuestionPath(question));
  };

  return (
    <div className="intent-page-shell career-page-shell">
      <Nav variant="home" avatarName={displayName} />
      <main className="careers careers--hub">
        {notice ? (
          <CareersFeedback tone="success">
            <div className="careers__notice">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice(null)}>
                Dismiss
              </button>
            </div>
          </CareersFeedback>
        ) : null}

        <header className="careers-hub__header">
          <div className="careers-hub__intro">
            <h1 className="careers-hub__title">Careers</h1>
            <p className="careers-hub__lede">Get the right help, opportunities and next steps from your alumni network.</p>
          </div>
          <div className="careers-hub__art" aria-hidden style={{ backgroundImage: `url("${HERO_IMAGE}")` }} />
        </header>

        <form className="careers-hub__search" role="search" onSubmit={onSearch}>
          <label htmlFor={searchId} className="careers-hub__sr">
            Search careers
          </label>
          <span className="careers-hub__search-icon" aria-hidden>
            <Icon name="search" />
          </span>
          <input
            id={searchId}
            className="careers-hub__search-input"
            type="search"
            value={question}
            maxLength={MATCH_QUESTION_MAX}
            placeholder="Search for a company, role, topic or career goal…"
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button type="submit" className="careers-hub__search-go" disabled={!canSearch} aria-label="Search">
            <Icon name="arrow" />
          </button>
        </form>

        <nav className="careers-hub__topics" aria-label="What do you need help with?">
          {CAREER_HELP_TOPICS.map((t) => (
            <Link key={t.label} to={t.to} className="careers-hub__topic">
              <span className="careers-hub__topic-icon" aria-hidden>
                <Icon name={t.icon} />
              </span>
              {t.label}
            </Link>
          ))}
        </nav>

        <div className="careers-hub__grid">
          <section className="hub-card careers-hub__opps" aria-labelledby="careers-opps-title">
            <div className="hub-card__head">
              <span className="hub-card__icon" aria-hidden>
                <Icon name="referral" />
              </span>
              <div className="hub-card__heading">
                <h2 id="careers-opps-title" className="hub-card__title">
                  Opportunities for you
                </h2>
                <p className="careers__note">Roles shared by alumni.</p>
              </div>
              <button type="button" className="hub-card__pill" onClick={() => hiringFlowRef.current?.open()}>
                Post a role
              </button>
            </div>

            {rolesFeed.isPending ? (
              <p className="careers__note" role="status">
                Loading roles…
              </p>
            ) : rolesFeed.isError ? (
              <p className="careers__note" role="alert">
                {browsingLimitFromError(rolesFeed.error) ?? "Couldn't load roles."}{" "}
                <button type="button" className="careers__textbtn" onClick={() => void rolesFeed.refetch()}>
                  Try again
                </button>
              </p>
            ) : roles.length === 0 ? (
              <p className="careers__empty">Hiring? Post a role and alumni will see it here.</p>
            ) : (
              <>
                <ul className="careers-hub__roles">
                  {shownRoles.map(({ item, row }) => {
                    const companyName = row.companySubtitle?.split(" · ")[0]?.trim() || "";
                    const initial = (companyName || row.roleHeader).trim().charAt(0).toUpperCase() || "·";
                    const meta = [row.companySubtitle, row.experience, row.employmentType].filter(Boolean).join(" · ");
                    return (
                      <li key={item.id} className="careers-hub__role-item">
                        <Link to={`/profiles/${item.authorPersonId}`} className="careers-hub__role">
                          <span className="careers-hub__role-tile" aria-hidden>
                            {initial}
                          </span>
                          <span className="careers-hub__role-main">
                            <span className="careers-hub__role-title">{row.roleHeader}</span>
                            {meta ? <span className="careers-hub__role-meta">{meta}</span> : null}
                            <span className="careers-hub__role-by">
                              <span>Posted by {item.authorFullName}</span>
                              <DeptBatchMeta
                                className="careers-hub__role-by-meta dept-batch-meta"
                                departmentCode={item.authorDepartmentCode}
                                batchYear={item.authorBatchYear}
                              />
                            </span>
                          </span>
                          {row.postedRelative ? <span className="careers-hub__role-time">{row.postedRelative}</span> : null}
                        </Link>
                        {/* Sibling of the row link (a button can't sit inside a link). */}
                        <WallShareButton postId={item.id} audienceLabel={item.audience?.label ?? null} />
                      </li>
                    );
                  })}
                </ul>
                {roles.length > ROLES_PREVIEW ? (
                  <button
                    type="button"
                    className="careers__textbtn careers-hub__view-all"
                    aria-expanded={showAllRoles}
                    onClick={() => setShowAllRoles((v) => !v)}
                  >
                    {showAllRoles ? "Show fewer" : `View all jobs (${roles.length})`}
                  </button>
                ) : null}
              </>
            )}
          </section>

          <aside className="careers-hub__side" aria-label="Your activity and quick links">
            <YourReachoutsCard />

            <ReachoutsWaitingCard />

            <HubSideCard id="careers-links-title" title="Quick links" icon="links">
              <ul className="hub-card__list">
                <li>
                  <button
                    type="button"
                    className="hub-card__item hub-card__item--button"
                    aria-expanded={companiesOpen}
                    aria-controls="careers-referral-companies"
                    onClick={() => setCompaniesOpen((v) => !v)}
                  >
                    <span className="hub-card__item-title">Companies you can get referred to</span>
                    <span className="hub-card__chev" aria-hidden data-open={companiesOpen ? "true" : "false"}>
                      <Icon name="chevron" />
                    </span>
                  </button>
                  <div id="careers-referral-companies" className="careers-hub__companies" hidden={!companiesOpen}>
                    {companies.isPending ? (
                      <p className="careers__note" role="status">
                        Loading companies…
                      </p>
                    ) : companies.isError ? (
                      <CareersFeedback tone="error">
                        <p className="careers__note">
                          Couldn&apos;t load companies.{" "}
                          <button type="button" className="careers__textbtn" onClick={() => void companies.refetch()}>
                            Try again
                          </button>
                        </p>
                      </CareersFeedback>
                    ) : companyList.length === 0 ? (
                      <p className="careers__note">No alumni have said they&apos;re open to referrals yet.</p>
                    ) : (
                      <>
                        <p className="careers__note">Alumni here have said they&apos;re open to referrals.</p>
                        <ul className="careers-hub__company-list">
                          {shownCompanies.map((c) => (
                            <li key={c.company}>
                              <Link to={careersCompanyPath(c.company)} className="careers-hub__company">
                                <span>{c.company}</span>
                                <span className="careers__row-meta">
                                  {c.alumni} {c.alumni === 1 ? "alum" : "alumni"}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                        {companyList.length > COMPANIES_PREVIEW ? (
                          <button type="button" className="careers__textbtn" onClick={() => setShowAllCompanies((v) => !v)}>
                            {showAllCompanies ? "Show fewer" : `See all ${companyList.length} companies`}
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                </li>
                <li>
                  <Link to="/search" className="hub-card__item">
                    <span className="hub-card__item-title">Browse all alumni</span>
                    <span className="hub-card__chev" aria-hidden>
                      <Icon name="chevron" />
                    </span>
                  </Link>
                </li>
                <li>
                  <button type="button" className="hub-card__item hub-card__item--button" onClick={() => hiringFlowRef.current?.open()}>
                    <span className="hub-card__item-title">Post a role</span>
                    <span className="hub-card__chev" aria-hidden>
                      <Icon name="chevron" />
                    </span>
                  </button>
                </li>
              </ul>
            </HubSideCard>
          </aside>
        </div>
      </main>

      <PostRoleHiringFlow
        ref={hiringFlowRef}
        onPublishSuccess={() => {
          setNotice("Role published. It's now under Opportunities for you.");
          void queryClient.invalidateQueries({ queryKey: queryKeys.career.roles() });
          void queryClient.invalidateQueries({ queryKey: queryKeys.career.intentFeed() });
          void queryClient.invalidateQueries({ queryKey: ["home", "opportunity-rail"] });
        }}
      />
    </div>
  );
}
