import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import "../styles/careers.css";
import "../styles/business.css";
import { CareersFeedback } from "../components/CareersFeedback";
import { Nav } from "../components/Nav";
import { IntentcastActivityRowsList } from "../components/CareerIntentFeedRows";
import type { CareerFeedRowModel } from "../components/CareerIntentFeedRows";
import { PostBulletinFlow, type PostBulletinFlowHandle } from "../components/PostBulletinFlow";
import { LineIcon } from "../components/LineIcon";
import { ReachoutsWaitingCard } from "../components/ReachoutsWaitingCard";
import { YourReachoutsCard } from "../components/YourReachoutsCard";
import { YourRequestsCard } from "../components/YourRequestsCard";
import "../styles/hub-cards.css";
import type { IntentcastFeedResponse } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { assertApiGet } from "../lib/assertApiGet";
import { publicAsset } from "../lib/appBase";
import { browsingLimitFromError } from "../lib/browsingLimits";
import { mapIntentcastToRow } from "../lib/careerFeedRow";
import { askWithQuestionPath } from "../lib/careers";
import { MATCH_QUESTION_MAX, MATCH_QUESTION_MIN } from "../lib/matchApi";
import { queryKeys } from "../lib/queryKeys";
import {
  BUSINESS_FEED_PATH,
  BUSINESS_SHORTCUTS,
  BUSINESS_TABS,
  inBusinessTab,
  isBusinessPost,
  type BusinessTab,
} from "../lib/business";

/** How many opportunities show before "View all". */
const OPPORTUNITIES_PREVIEW = 4;
const HERO_IMAGE = publicAsset("login-hero-house.jpg");

/**
 * Business (/intent/business). Search and shortcuts open Ask. "Relevant opportunities" lists Startups
 * posts from the Wall (one post, both places); "Post a request" opens the Wall composer on Startups + Ask.
 * The side column ("Your business") holds your open requests with their step, and the shared reachout
 * cards. Raise capital and fundraising are parked.
 */
export function BusinessPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const searchId = useId();
  const tabsId = useId();
  const flowRef = useRef<PostBulletinFlowHandle>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [question, setQuestion] = useState("");
  const [tab, setTab] = useState<BusinessTab>("all");
  const [showAll, setShowAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const signedIn = auth.status === "authenticated";

  const feed = useQuery({
    queryKey: queryKeys.business.opportunities(),
    queryFn: ({ signal }) => assertApiGet<IntentcastFeedResponse>(BUSINESS_FEED_PATH, signal),
    enabled: signedIn,
  });

  const posts = useMemo(() => (feed.data?.intentcasts ?? []).filter(isBusinessPost), [feed.data]);
  const rows = useMemo(
    () =>
      posts
        .filter((p) => inBusinessTab(p, tab))
        .map((p) => mapIntentcastToRow(p, { includeGuidancePosts: true }))
        .filter((r): r is CareerFeedRowModel => r != null),
    [posts, tab],
  );

  if (!signedIn) return null;

  const displayName = auth.myProfile?.fullName?.trim() || undefined;
  const shownRows = showAll ? rows : rows.slice(0, OPPORTUNITIES_PREVIEW);
  const canSearch = question.trim().length >= MATCH_QUESTION_MIN;
  const openComposer = () => flowRef.current?.open({ category: "startups", kind: "ask" });

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    if (!canSearch) return;
    navigate(askWithQuestionPath(question));
  };

  return (
    <div className="intent-page-shell career-page-shell business-page-shell">
      <Nav variant="home" avatarName={displayName} />
      <main className="careers careers--hub business">
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
            <h1 className="careers-hub__title">Business</h1>
            <p className="careers-hub__lede">Move your business forward with the right people from your alumni network.</p>
          </div>
          <div className="careers-hub__art" aria-hidden style={{ backgroundImage: `url("${HERO_IMAGE}")` }} />
        </header>

        <form className="careers-hub__search" role="search" onSubmit={onSearch}>
          <label htmlFor={searchId} className="careers-hub__sr">
            Search business help
          </label>
          <span className="careers-hub__search-icon" aria-hidden>
            <LineIcon name="search" />
          </span>
          <input
            id={searchId}
            className="careers-hub__search-input"
            type="search"
            value={question}
            maxLength={MATCH_QUESTION_MAX}
            placeholder="Find customers, partners, talent or advice, or describe your need…"
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button type="submit" className="careers-hub__search-go" disabled={!canSearch} aria-label="Search">
            <LineIcon name="arrow" />
          </button>
        </form>

        <nav className="careers-hub__topics business__shortcuts" aria-label="What does your business need?">
          {BUSINESS_SHORTCUTS.map((s) => (
            <Link key={s.label} to={s.to} className="careers-hub__topic">
              <span className="careers-hub__topic-icon" aria-hidden>
                <LineIcon name={s.icon} />
              </span>
              {s.label}
            </Link>
          ))}
        </nav>

        <div className="business__grid">
          <aside className="business__side" aria-label="Your business">
            <YourRequestsCard onResolved={(label) => setNotice(`Request resolved: ${label}.`)} />
            <ReachoutsWaitingCard />
            <YourReachoutsCard />
          </aside>

          <section className="hub-card business__opps" aria-labelledby="business-opps-title">
            <div className="hub-card__head">
              <span className="hub-card__icon" aria-hidden>
                <LineIcon name="wall" />
              </span>
              <div className="hub-card__heading">
                <h2 id="business-opps-title" className="hub-card__title">
                  Relevant opportunities
                </h2>
                <p className="careers__note">Needs and offers from alumni. They also show on the Wall.</p>
              </div>
              <button type="button" className="hub-card__pill" onClick={openComposer}>
                Post a request
              </button>
            </div>

            <div className="business__tabs" role="tablist" aria-label="Opportunity type">
              {BUSINESS_TABS.map((t, index) => (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabRefs.current[index] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`${tabsId}-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls={`${tabsId}-panel`}
                  tabIndex={tab === t.id ? 0 : -1}
                  className="business__tab"
                  onClick={() => {
                    setTab(t.id);
                    setShowAll(false);
                  }}
                  onKeyDown={(e) => {
                    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
                    e.preventDefault();
                    const last = BUSINESS_TABS.length - 1;
                    const next =
                      e.key === "Home" ? 0 : e.key === "End" ? last : e.key === "ArrowRight" ? (index === last ? 0 : index + 1) : index === 0 ? last : index - 1;
                    setTab(BUSINESS_TABS.at(next)!.id);
                    setShowAll(false);
                    tabRefs.current.at(next)?.focus();
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`}>
              {feed.isPending ? (
                <p className="careers__note" role="status">
                  Loading opportunities…
                </p>
              ) : feed.isError ? (
                <p className="careers__note" role="alert">
                  {browsingLimitFromError(feed.error) ?? "Couldn't load opportunities."}{" "}
                  <button type="button" className="careers__textbtn" onClick={() => void feed.refetch()}>
                    Try again
                  </button>
                </p>
              ) : rows.length === 0 ? (
                <p className="careers__empty">
                  {tab === "offers"
                    ? "No offers yet."
                    : tab === "needs"
                      ? "No needs posted yet."
                      : "No needs or offers yet."}{" "}
                  Post a request and alumni will see it here and on the Wall.
                </p>
              ) : (
                <>
                  {/* Same rows as the Wall; the Wall's compact row layout is scoped to .home-ideal__opportunities. */}
                  <div className="home-ideal__opportunities business__wall-rows">
                  <IntentcastActivityRowsList
                    rows={shownRows}
                    viewerPersonId={auth.person.personId}
                    deleteSubmittingId={null}
                    onRequestDelete={() => {}}
                    ownerDeleteMenu={false}
                    linkifyBody
                    shareable
                    listClassName="business__rows"
                  />
                  </div>
                  {rows.length > OPPORTUNITIES_PREVIEW ? (
                    <button
                      type="button"
                      className="careers__textbtn business__view-all"
                      aria-expanded={showAll}
                      onClick={() => setShowAll((v) => !v)}
                    >
                      {showAll ? "Show fewer" : `View all (${rows.length})`}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </section>
        </div>
      </main>

      <PostBulletinFlow
        ref={flowRef}
        onPublishSuccess={() => {
          setNotice("Request posted. It shows here and on the Wall.");
          void queryClient.invalidateQueries({ queryKey: queryKeys.business.opportunities() });
          void queryClient.invalidateQueries({ queryKey: queryKeys.business.myRequests() });
          void queryClient.invalidateQueries({ queryKey: ["home", "opportunity-rail"] });
        }}
      />
    </div>
  );
}
