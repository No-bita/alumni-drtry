import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import "../styles/careers.css";
import { CareersFeedback } from "../components/CareersFeedback";
import { Nav } from "../components/Nav";
import { DeptBatchMeta } from "../components/DeptBatchMeta";
import { PostRoleHiringFlow, type PostRoleHiringFlowHandle } from "../components/PostRoleHiringFlow";
import type { ContactRequestsInboxResponse, IntentcastFeedResponse } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { assertApiGet } from "../lib/assertApiGet";
import { publicAsset } from "../lib/appBase";
import { mapIntentcastToRow } from "../lib/careerFeedRow";
import {
  CAREER_HELP_TOPICS,
  askWithQuestionPath,
  careersCompanyPath,
  careersKeys,
  fetchMyCompanyDemand,
  fetchReferralCompanies,
  type CareerTopicIcon,
} from "../lib/careers";
import { MATCH_QUESTION_MAX, MATCH_QUESTION_MIN } from "../lib/matchApi";
import { parseOpenToPreferences } from "../lib/openToPreferences";
import { queryKeys } from "../lib/queryKeys";
import { browsingLimitFromError } from "../lib/browsingLimits";
import { SENT_NOTES_QUERY_KEY, fetchSentNotes, sentNoteStatusLabel } from "../lib/sentNotes";
import { formatRelativeTime } from "../lib/formatRelativeTime";

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
  const sent = useQuery({ queryKey: SENT_NOTES_QUERY_KEY, queryFn: ({ signal }) => fetchSentNotes(signal), enabled: signedIn });
  const inbox = useQuery({
    queryKey: ["contact-requests", "inbox"],
    queryFn: ({ signal }) => assertApiGet<ContactRequestsInboxResponse>("/v1/contact-requests/inbox", signal),
    enabled: signedIn,
  });
  const demand = useQuery({ queryKey: careersKeys.myCompanyDemand(), queryFn: ({ signal }) => fetchMyCompanyDemand(signal), enabled: signedIn });
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
  const openTo = parseOpenToPreferences(auth.myProfile?.openToPreferences)?.selected ?? [];
  const waiting = inbox.data?.requests.length ?? 0;
  const myDemand = demand.data ?? null;
  // Asks waiting for you: anyone who has said what they can help with, has asks waiting, or works somewhere.
  const showHelper = openTo.length > 0 || waiting > 0 || myDemand !== null;
  const reachouts = (sent.data?.requests ?? []).slice(0, 3);
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
          <section className="careers-hub__card careers-hub__opps" aria-labelledby="careers-opps-title">
            <div className="careers-hub__card-head">
              <span className="careers-hub__card-icon" aria-hidden>
                <Icon name="referral" />
              </span>
              <div className="careers-hub__card-heading">
                <h2 id="careers-opps-title" className="careers-hub__h2">
                  Opportunities for you
                </h2>
                <p className="careers__note">Roles shared by alumni.</p>
              </div>
              <button type="button" className="careers-hub__pill" onClick={() => hiringFlowRef.current?.open()}>
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
                      <li key={item.id}>
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
            {reachouts.length > 0 ? (
              <SideCard id="careers-reachouts-title" title="Your reachouts" icon="advice" action={<Link to="/notifications" className="careers__more">All</Link>}>
                <ul className="careers-hub__list">
                  {reachouts.map((n) => (
                    <li key={n.id}>
                      <Link to="/notifications" className="careers-hub__item">
                        <span className="careers-hub__item-main">
                          <span className="careers-hub__item-title">{n.recipientFullName?.trim() || "An alum"}</span>
                          <span className="careers__row-meta">Sent {formatRelativeTime(n.createdAt)}</span>
                        </span>
                        <span className={`careers__status careers__status--${n.status}`}>{sentNoteStatusLabel(n)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </SideCard>
            ) : null}

            {showHelper ? (
              <SideCard id="careers-help-title" title="Asks waiting for you" icon="inbox" tone="warm">
                <p className="careers__note">Juniors and peers are looking for people like you.</p>
                <Link to="/notifications" className="careers-hub__item careers-hub__item--boxed" aria-label={`${waiting} ${waiting === 1 ? "ask" : "asks"} waiting for you`}>
                  <span className="careers-hub__item-title">{waiting === 1 ? "1 ask waiting" : `${waiting} asks waiting`}</span>
                  <span className="careers__count" aria-hidden>
                    {waiting}
                  </span>
                </Link>
                {myDemand ? (
                  <div className="careers-hub__demand">
                    <span className="careers-hub__item-title">
                      {myDemand.asks === 0
                        ? `No one has asked about ${myDemand.company} in the last ${myDemand.days} days`
                        : `${myDemand.asks} ${myDemand.asks === 1 ? "ask" : "asks"} about ${myDemand.company} in the last ${myDemand.days} days`}
                    </span>
                    <span className="careers__row-meta">
                      {openTo.includes("referrals")
                        ? "You're open to referrals, so you can show up for them."
                        : "Say you're open to referrals to show up for them."}
                    </span>
                  </div>
                ) : null}
                {auth.myProfile?.id ? (
                  <Link to={`/profiles/${auth.myProfile.id}?edit=open-to`} className="careers__more">
                    Offer help: update what you&apos;re open to
                  </Link>
                ) : null}
              </SideCard>
            ) : null}

            <SideCard id="careers-links-title" title="Quick links" icon="links">
              <ul className="careers-hub__list">
                <li>
                  <button
                    type="button"
                    className="careers-hub__item careers-hub__item--button"
                    aria-expanded={companiesOpen}
                    aria-controls="careers-referral-companies"
                    onClick={() => setCompaniesOpen((v) => !v)}
                  >
                    <span className="careers-hub__item-title">Companies you can get referred to</span>
                    <span className="careers-hub__chev" aria-hidden data-open={companiesOpen ? "true" : "false"}>
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
                  <Link to="/search" className="careers-hub__item">
                    <span className="careers-hub__item-title">Browse all alumni</span>
                    <span className="careers-hub__chev" aria-hidden>
                      <Icon name="chevron" />
                    </span>
                  </Link>
                </li>
                <li>
                  <button type="button" className="careers-hub__item careers-hub__item--button" onClick={() => hiringFlowRef.current?.open()}>
                    <span className="careers-hub__item-title">Post a role</span>
                    <span className="careers-hub__chev" aria-hidden>
                      <Icon name="chevron" />
                    </span>
                  </button>
                </li>
              </ul>
            </SideCard>
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

function SideCard({
  id,
  title,
  icon,
  action,
  tone,
  children,
}: {
  id: string;
  title: string;
  icon: CareerTopicIcon | "links" | "inbox";
  action?: ReactNode;
  tone?: "warm";
  children: ReactNode;
}) {
  return (
    <section className={`careers-hub__card careers-hub__side-card${tone === "warm" ? " careers-hub__side-card--warm" : ""}`} aria-labelledby={id}>
      <div className="careers-hub__card-head">
        <span className="careers-hub__card-icon" aria-hidden>
          <Icon name={icon} />
        </span>
        <h2 id={id} className="careers-hub__h2">
          {title}
        </h2>
        {action ?? null}
      </div>
      {children}
    </section>
  );
}

type IconName = CareerTopicIcon | "links" | "inbox" | "search" | "arrow" | "chevron";

/** Simple line icons (decorative; every use is aria-hidden). */
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    referral: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7M3 12.5h18M11 12v2h2v-2" />
      </>
    ),
    interview: <path d="M12 3 3 7.5 12 12l9-4.5L12 3ZM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5" />,
    switch: <path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5" />,
    studies: (
      <>
        <path d="M2.5 9 12 4.5 21.5 9 12 13.5 2.5 9Z" />
        <path d="M6.5 11v4.5c1.4 1.4 3.3 2 5.5 2s4.1-.6 5.5-2V11M21.5 9v5" />
      </>
    ),
    advice: (
      <>
        <path d="M4 18.5V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H8.5L4 19.5Z" />
        <path d="M8.5 10h.01M12 10h.01M15.5 10h.01" />
      </>
    ),
    links: (
      <>
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" />
      </>
    ),
    inbox: (
      <>
        <path d="M4 13.5 6.2 6A2 2 0 0 1 8.1 4.5h7.8a2 2 0 0 1 1.9 1.5l2.2 7.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18v-4.5Z" />
        <path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    chevron: <path d="m9 6 6 6-6 6" />,
  };
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      {paths[name]}
    </svg>
  );
}
