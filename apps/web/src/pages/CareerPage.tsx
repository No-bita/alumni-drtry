import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import "../styles/careers.css";
import { CareersFeedback } from "../components/CareersFeedback";
import { Nav } from "../components/Nav";
import { CareerIntentFeedRows } from "../components/CareerIntentFeedRows";
import { PostRoleHiringFlow, type PostRoleHiringFlowHandle } from "../components/PostRoleHiringFlow";
import type { ContactRequestsInboxResponse, IntentcastFeedResponse } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { assertApiGet } from "../lib/assertApiGet";
import { mapIntentcastToRow } from "../lib/careerFeedRow";
import {
  CAREER_HELP_TOPICS,
  askWithTopicPath,
  careersCompanyPath,
  careersKeys,
  fetchMyCompanyDemand,
  fetchReferralCompanies,
} from "../lib/careers";
import { parseOpenToPreferences } from "../lib/openToPreferences";
import { queryKeys } from "../lib/queryKeys";
import { SENT_NOTES_QUERY_KEY, fetchSentNotes, sentNoteStatusLabel } from "../lib/sentNotes";
import { formatRelativeTime } from "../lib/formatRelativeTime";

/** How many companies show before "See all". */
const COMPANIES_PREVIEW = 5;
const yy = (y: number | null | undefined) => (y ? `'${String(y).slice(-2)}` : "");

/**
 * Careers (/intent/career). Built around the job seeker: find alumni at the company you're applying
 * to and ask them directly. Smaller sections serve alumni who help, people hiring, and everyone else.
 * Sections that would be empty stay hidden.
 */
export function CareerPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companyId = useId();
  const roleId = useId();
  const hiringFlowRef = useRef<PostRoleHiringFlowHandle>(null);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
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
  const feed = useQuery({
    queryKey: queryKeys.career.intentFeed(),
    queryFn: ({ signal }) =>
      assertApiGet<IntentcastFeedResponse>("/v1/intentcasts?limit=48&offset=0&excludeAuthorSoftDeleted=true&excludeCategories=guidance", signal),
    enabled: signedIn,
  });

  const posts = useMemo(() => feed.data?.intentcasts ?? [], [feed.data]);
  const roles = useMemo(
    () => posts.filter((p) => p.category === "hiring").map((p) => ({ item: p, row: mapIntentcastToRow(p) })).filter((x) => x.row).slice(0, 3),
    [posts],
  );
  const recent = useMemo(
    () => posts.filter((p) => p.category !== "hiring").map((p) => ({ item: p, row: mapIntentcastToRow(p) })).filter((x) => x.row).slice(0, 3),
    [posts],
  );

  if (!signedIn) return null;

  const displayName = auth.myProfile?.fullName?.trim() || undefined;
  const openTo = parseOpenToPreferences(auth.myProfile?.openToPreferences)?.selected ?? [];
  const waiting = inbox.data?.requests.length ?? 0;
  const myDemand = demand.data ?? null;
  // "You can help": anyone who has said what they can help with, has asks waiting, or works somewhere.
  const showHelper = openTo.length > 0 || waiting > 0 || myDemand !== null;
  const myAsks = (sent.data?.requests ?? []).slice(0, 3);
  const companyList = companies.data ?? [];
  const shownCompanies = showAllCompanies ? companyList : companyList.slice(0, COMPANIES_PREVIEW);
  const canSearch = company.trim().length >= 2;

  const onFind = (e: FormEvent) => {
    e.preventDefault();
    if (!canSearch) return;
    navigate(careersCompanyPath(company, role));
  };

  return (
    <div className="intent-page-shell career-page-shell">
      <Nav
        variant="home"
        avatarName={displayName}
        appToolbarLead={
          <div className="nav-app-toolbar__welcome">
            <h1 className="nav-app-toolbar__welcome-title">Careers</h1>
          </div>
        }
      />
      <main className="careers">
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

        <section className="careers__hero" aria-labelledby="careers-hero-title">
          <h2 id="careers-hero-title" className="careers__title">
            Get referred where you&apos;re applying.
          </h2>
          <p className="careers__lede">Find alumni at the company and ask them directly.</p>
          <form className="careers__search" onSubmit={onFind}>
            <label htmlFor={companyId} className="careers__label">
              Where are you applying?
            </label>
            <input
              id={companyId}
              className="careers__input"
              value={company}
              maxLength={120}
              autoComplete="organization"
              placeholder="Company, e.g. Razorpay"
              onChange={(e) => setCompany(e.target.value)}
            />
            <label htmlFor={roleId} className="careers__label">
              Role <span className="careers__optional">(optional)</span>
            </label>
            <input
              id={roleId}
              className="careers__input"
              value={role}
              maxLength={120}
              placeholder="e.g. Product manager"
              onChange={(e) => setRole(e.target.value)}
            />
            <button type="submit" className="careers__primary" disabled={!canSearch}>
              Find alumni
            </button>
          </form>
        </section>

        <section className="careers__section" aria-labelledby="careers-topics-title">
          <h2 id="careers-topics-title" className="careers__h2">
            Other things alumni can help with
          </h2>
          <div className="careers__topics">
            {CAREER_HELP_TOPICS.map((t) => (
              <Link key={t.category} to={askWithTopicPath(t.category)} className="careers__topic">
                {t.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="careers__section" aria-labelledby="careers-companies-title">
          <div className="careers__head">
            <h2 id="careers-companies-title" className="careers__h2">
              Companies you can get referred to
            </h2>
            <p className="careers__note">Alumni here have said they&apos;re open to referrals.</p>
          </div>
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
            <p className="careers__empty">
              No alumni have said they&apos;re open to referrals yet. <Link to="/search">Browse all alumni</Link>
            </p>
          ) : (
            <>
              <ul className="careers__rows">
                {shownCompanies.map((c) => (
                  <li key={c.company}>
                    <Link to={careersCompanyPath(c.company)} className="careers__row">
                      <span className="careers__row-title">{c.company}</span>
                      <span className="careers__row-meta">
                        {c.alumni} {c.alumni === 1 ? "alum" : "alumni"} →
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
        </section>

        {myAsks.length > 0 ? (
          <section className="careers__section" aria-labelledby="careers-asks-title">
            <div className="careers__head careers__head--row">
              <h2 id="careers-asks-title" className="careers__h2">
                Your asks
              </h2>
              <Link to="/notifications" className="careers__more">
                All
              </Link>
            </div>
            <ul className="careers__cards">
              {myAsks.map((n) => (
                <li key={n.id}>
                  <Link to="/notifications" className="careers__card">
                    <span className="careers__card-top">
                      <span className="careers__row-title">{n.recipientFullName?.trim() || "An alum"}</span>
                      <span className={`careers__status careers__status--${n.status}`}>{sentNoteStatusLabel(n)}</span>
                    </span>
                    <span className="careers__row-meta">Sent {formatRelativeTime(n.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {showHelper ? (
          <section className="careers__section careers__helper" aria-labelledby="careers-help-title">
            <div className="careers__head">
              <h2 id="careers-help-title" className="careers__h2">
                You can help
              </h2>
              <p className="careers__note">Juniors and peers are looking for people like you.</p>
            </div>
            <Link to="/notifications" className="careers__row careers__row--card">
              <span className="careers__row-title">Asks waiting for you</span>
              <span className="careers__count" aria-label={`${waiting} waiting`}>
                {waiting}
              </span>
            </Link>
            {myDemand ? (
              <div className="careers__card careers__card--static">
                <span className="careers__row-title">
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
          </section>
        ) : null}

        <section className="careers__section" aria-labelledby="careers-roles-title">
          <div className="careers__head careers__head--row">
            <h2 id="careers-roles-title" className="careers__h2">
              Roles from alumni
            </h2>
            <button type="button" className="careers__more" onClick={() => hiringFlowRef.current?.open()}>
              Post a role
            </button>
          </div>
          {roles.length > 0 ? (
            <ul className="careers__rows">
              {roles.map(({ item, row }) => (
                <li key={item.id}>
                  <Link to={`/profiles/${item.authorPersonId}`} className="careers__row careers__row--stack">
                    <span className="careers__row-title">{row!.roleHeader}</span>
                    <span className="careers__row-meta">
                      {[row!.companySubtitle, row!.employmentType, `posted by ${item.authorFullName}`].filter(Boolean).join(" · ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="careers__note">Hiring? Post a role and alumni will see it here.</p>
          )}
        </section>

        {recent.length > 0 ? (
          <section className="careers__section" aria-labelledby="careers-recent-title">
            <h2 id="careers-recent-title" className="careers__h2">
              Recent from alumni
            </h2>
            <ul className="careers__cards">
              {recent.map(({ item, row }) => (
                <li key={item.id}>
                  <Link to={`/profiles/${item.authorPersonId}`} className="careers__card">
                    <span className="careers__row-meta">
                      {row!.chips[0] ?? "Post"}
                      {row!.postedRelative ? ` · ${row!.postedRelative}` : ""}
                    </span>
                    <span className="careers__row-title">{row!.roleHeader}</span>
                    <span className="careers__row-meta">
                      {item.authorFullName}
                      {item.authorBatchYear ? ` · Batch ${yy(item.authorBatchYear)}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {posts.length > 0 ? (
          <button
            type="button"
            className="careers__textbtn"
            aria-expanded={activityOpen}
            aria-controls="career-activity-feed"
            onClick={() => setActivityOpen((open) => !open)}
          >
            {activityOpen ? "Hide all posts" : "See all posts from alumni"}
          </button>
        ) : null}
        <div id="career-activity-feed" className="career-page-intent-feed" role="region" aria-label="All posts from alumni" hidden={!activityOpen}>
          <CareerIntentFeedRows
            intentcasts={posts}
            loading={feed.isPending}
            error={feed.isError}
            viewerPersonId={auth.person.personId}
            className="career-page-intent-feed__panel"
          />
        </div>

        <Link to="/search" className="careers__secondary">
          Browse all alumni
        </Link>
      </main>

      <PostRoleHiringFlow
        ref={hiringFlowRef}
        onPublishSuccess={() => {
          setNotice("Role published. It's now under Roles from alumni.");
          void queryClient.invalidateQueries({ queryKey: queryKeys.career.intentFeed() });
          void queryClient.invalidateQueries({ queryKey: ["home", "opportunity-rail"] });
        }}
      />
    </div>
  );
}
