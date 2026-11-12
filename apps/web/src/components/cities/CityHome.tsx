import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/careers.css";
import "../../styles/hub-cards.css";
import { PostAudienceLabel } from "../PostAudienceField";
import { HubSideCard } from "../HubSideCard";
import { LineIcon } from "../LineIcon";
import { WallShareButton } from "../WallShareButton";
import { formatRelativeTime } from "../../lib/formatRelativeTime";
import { splitBulletinPostBody, stripBulletinUiCategory } from "../../lib/bulletinPostCardUtils";
import { MATCH_QUESTION_MAX, MATCH_QUESTION_MIN, buildMatchSearch } from "../../lib/matchApi";
import {
  endArrival,
  fetchCityPosts,
  firstName,
  yy,
  type CityPayload,
  type CityPost,
} from "../../lib/cities";
import { publicAsset } from "../../lib/appBase";
import { IconMapPin, IconUsers } from "../LocationPageIcons";
import { CityEmptyPrompt } from "./CityEmptyPrompt";
import { CitySheet } from "./CitySheet";
import { NewcomerOffersSection } from "./NewcomerOffersSection";

export type CityAskStarter = { headline?: string; body?: string; housingPhotoTip?: boolean };

/** File: `apps/web/public/media/city-hero-placeholder.jpg`, served under the app base (`/app/media/...`). */
const CITY_HERO_PLACEHOLDER = publicAsset("media/city-hero-placeholder.jpg");
/** Every other city: the building photo used on Careers, Business and sign-in (no city landmark). */
const CITY_HERO_GENERIC = publicAsset("login-hero-house.jpg");
/** Newest posts shown before "View all posts". */
const POSTS_PREVIEW = 4;

function postTitle(content: string): string {
  const { title } = splitBulletinPostBody(stripBulletinUiCategory(content));
  return title.trim();
}

function postBody(content: string): string {
  const { summary } = splitBulletinPostBody(stripBulletinUiCategory(content));
  return (summary ?? "").trim();
}

/** The Bengaluru photo shows Vidhan Soudha, so only Bengaluru uses it. */
function isBengaluru(place: CityPayload["place"]): boolean {
  return place.city.trim().toLowerCase() === "bengaluru" || place.slug.startsWith("bengaluru");
}

type Shortcut = {
  id: "housing" | "neighbourhoods" | "services" | "people";
  label: string;
  icon: "home" | "pin" | "wrench" | "people";
  /** Starting headline for the Wall composer; the member edits it before posting. */
  starter: (city: string) => string;
};

const KIND_LABEL = { ask: "Ask", offer: "Offer", invitation: "Invitation" } as const;

const SHORTCUTS: Shortcut[] = [
  { id: "housing", label: "Housing & flatmates", icon: "home", starter: (city) => `Housing or flatmates in ${city}` },
  { id: "neighbourhoods", label: "Neighborhoods", icon: "pin", starter: (city) => `Neighbourhoods or commute in ${city}` },
  { id: "services", label: "Local services", icon: "wrench", starter: (city) => `Local services in ${city}` },
  { id: "people", label: "Meet people", icon: "people", starter: (city) => `Meeting people in ${city}` },
];

type PostTab = "all" | "ask" | "offer" | "invitation";
const POST_TABS: ReadonlyArray<{ id: PostTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "ask", label: "Asks" },
  { id: "offer", label: "Offers" },
  { id: "invitation", label: "Invitations" },
];

function ShortcutIcon({ icon }: { icon: Shortcut["icon"] }) {
  if (icon === "pin") return <IconMapPin width={20} height={20} />;
  if (icon === "people") return <IconUsers width={20} height={20} />;
  if (icon === "wrench")
    return (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14.7 6.3a4.2 4.2 0 0 0-5.6 5.6L4 17l3 3 5.1-5.1a4.2 4.2 0 0 0 5.6-5.6L14.5 12l-2.5-2.5z" />
      </svg>
    );
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9h13v-9" />
    </svg>
  );
}

/**
 * The city page (hub layout, like Careers and Business). Header with the city as title and Change city;
 * search opens Ask with the city set; four shortcuts prefill a Wall ask tagged with this city; the
 * community card lists the city's open Wall posts (read-only sheet, no reply counts); the side column
 * ("Your city") holds the shared reachout cards (passed in as `side`) and an at-a-glance card with the
 * new-in-town entry. Retired on purpose: the alumni list and the "update your city" links (#239).
 */
// `profileId` stays in the props type but is intentionally not destructured (see #239).
export function CityHome({
  data,
  onChanged,
  onOptIn,
  onAsk,
  onNotice,
  onChangeCity,
  switcherOpen = false,
  side,
}: {
  data: CityPayload;
  profileId: string | null;
  onChanged: () => void;
  onOptIn: () => void;
  onAsk: (starter: CityAskStarter) => void;
  onNotice: (text: string) => void;
  /** Opens the city switcher (the "Change city" control in the header). */
  onChangeCity?: () => void;
  switcherOpen?: boolean;
  /** Extra cards at the top of the side column (the page passes the shared reachout cards). */
  side?: ReactNode;
}) {
  const navigate = useNavigate();
  const searchId = useId();
  const tabsId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const city = data.place.city;
  const newcomer = data.viewerRole === "newcomer" && data.myArrival !== null;
  const yourCity = data.viewerRole === "local" || data.viewerRole === "newcomer";
  const bengaluru = isBengaluru(data.place);
  const [question, setQuestion] = useState("");
  const [tab, setTab] = useState<PostTab>("all");
  const [stopping, setStopping] = useState(false);
  const [openPost, setOpenPost] = useState<CityPost | null>(null);
  /** Preview expanded to every post already loaded (before or without paging). */
  const [expanded, setExpanded] = useState(false);
  /** "View all posts" paging: null until opened, then the full paged list. */
  const [all, setAll] = useState<{ posts: CityPost[]; nextCursor: string | null } | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);

  const stop = async () => {
    if (stopping) return;
    setStopping(true);
    const res = await endArrival();
    setStopping(false);
    if (res.error) {
      onNotice("Couldn’t update. Try again.");
      return;
    }
    onNotice("You’re no longer shown as new. Offers you already have stay here.");
    onChanged();
  };

  const openAll = async () => {
    setExpanded(true);
    if (!data.postsHasMore || all) return;
    setLoadingAll(true);
    try {
      setAll(await fetchCityPosts(data.place.placeId, null, new AbortController().signal));
    } catch {
      onNotice("Couldn’t load the posts. Try again.");
    } finally {
      setLoadingAll(false);
    }
  };

  const loadMore = async () => {
    if (!all?.nextCursor || loadingAll) return;
    setLoadingAll(true);
    try {
      const page = await fetchCityPosts(data.place.placeId, all.nextCursor, new AbortController().signal);
      setAll({ posts: [...all.posts, ...page.posts], nextCursor: page.nextCursor });
    } catch {
      onNotice("Couldn’t load more. Try again.");
    } finally {
      setLoadingAll(false);
    }
  };

  const source = all ? all.posts : data.posts;
  const filtered = tab === "all" ? source : source.filter((p) => p.kind === tab);
  const shown = expanded ? filtered : filtered.slice(0, POSTS_PREVIEW);
  const canViewAll = !expanded && (filtered.length > POSTS_PREVIEW || data.postsHasMore);
  const canSearch = question.trim().length >= MATCH_QUESTION_MIN;

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    if (!canSearch) return;
    navigate(`/match${buildMatchSearch({ question, overrides: { city } })}`);
  };

  return (
    <>
      <header className="careers-hub__header cities-hub__header">
        <div className="careers-hub__intro">
          <div className="cities-hub__titlerow">
            <h1 className="careers-hub__title">{city}</h1>
            <span className="cities-hub__badge">{yourCity ? "Your city" : "Exploring"}</span>
          </div>
          <p className="careers-hub__lede">Get settled, find local help and meet alumni in {city}.</p>
          {onChangeCity ? (
            <button
              type="button"
              className="cities-hub__change"
              aria-label={`Change city: ${city}`}
              aria-haspopup="dialog"
              aria-expanded={switcherOpen}
              onClick={onChangeCity}
            >
              Change city
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          ) : null}
        </div>
        <div className="careers-hub__art cities-hub__art">
          <img className="cities-home__photohero-img" src={bengaluru ? CITY_HERO_PLACEHOLDER : CITY_HERO_GENERIC} alt="" />
        </div>
          {bengaluru ? (
            // Shared city photo; source and license remain linked.
            <p className="cities-home__photohero-credit cities-hub__credit">
              Photo:{" "}
              <a href="https://commons.wikimedia.org/wiki/File:Vidhan_Soudha_-_Bangalore.jpg" target="_blank" rel="noreferrer">
                AjayTorvi
              </a>{" "}
              ·{" "}
              <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">
                CC BY-SA 4.0
              </a>
            </p>
          ) : null}
      </header>

      {/* Offers stay visible to the newcomer after "Stop showing me as new" (until their 30 days end). */}
      {newcomer || data.offers.length > 0 ? (
        <NewcomerOffersSection offers={data.offers} previousCity={data.myArrival?.previousCity ?? null} onChanged={onChanged} />
      ) : null}

      <form className="careers-hub__search" role="search" onSubmit={onSearch}>
        <label htmlFor={searchId} className="careers-hub__sr">
          Ask alumni in {city}
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
          placeholder={`Ask about housing, neighbourhoods or people in ${city}…`}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" className="careers-hub__search-go" disabled={!canSearch} aria-label="Search">
          <LineIcon name="arrow" />
        </button>
      </form>

      <section className="cities-hub__needs" aria-labelledby="cities-home-need">
        <h2 id="cities-home-need" className="cities-hub__needs-title">
          What do you need in {city}?
        </h2>
        <div className="careers-hub__topics">
          {SHORTCUTS.map((s) => (
            <button key={s.id} type="button" className="careers-hub__topic" onClick={() => onAsk({ headline: s.starter(city), ...(s.id === "housing" ? { housingPhotoTip: true } : {}) })}>
              <span className="careers-hub__topic-icon" aria-hidden>
                <ShortcutIcon icon={s.icon} />
              </span>
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <div className="cities-hub__grid">
        <aside className="cities-hub__side" aria-label="Your city">
          {side}
          <HubSideCard id="cities-glance-title" title="At a glance" icon="people">
            <ul className="cities-hub__facts">
              <li>
                <strong>{data.counts.alumni}</strong> {data.counts.alumni === 1 ? "alum lives here" : "alumni live here"}
              </li>
              <li>
                <strong>{data.counts.openToCityHelp}</strong> open to city help
              </li>
              {data.arrivals ? (
                <li>
                  <strong>{data.arrivals.total}</strong> new in town
                </li>
              ) : null}
            </ul>
            {newcomer ? (
              <div className="cities-hub__newcomer">
                <p className="hub-card__note">
                  Shown as new to local alumni for {data.myArrival!.daysLeft} more {data.myArrival!.daysLeft === 1 ? "day" : "days"}
                </p>
                <button type="button" className="hub-card__more" disabled={stopping} onClick={() => void stop()}>
                  Stop showing me as new
                </button>
              </div>
            ) : data.arrivalPrompt ? (
              <button type="button" className="hub-card__more" onClick={onOptIn}>
                Just moved? Show me as new in town ›
              </button>
            ) : null}
          </HubSideCard>
        </aside>

        <section className="hub-card cities-hub__community" aria-labelledby="cities-home-requests">
          <div className="hub-card__head">
            <span className="hub-card__icon" aria-hidden>
              <LineIcon name="wall" />
            </span>
            <div className="hub-card__heading">
              <h2 id="cities-home-requests" className="hub-card__title">
                From the {city} community
              </h2>
              <p className="cities__note">Open posts from the Wall, filtered to {city}.</p>
            </div>
            <button type="button" className="hub-card__pill" onClick={() => onAsk({})}>
              Ask the community
            </button>
          </div>

          <div className="hub-tabs cities-hub__tabs" role="tablist" aria-label="Post type">
            {POST_TABS.map((t, index) => (
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
                className="hub-tab"
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
                  e.preventDefault();
                  const last = POST_TABS.length - 1;
                  const next =
                    e.key === "Home" ? 0 : e.key === "End" ? last : e.key === "ArrowRight" ? (index === last ? 0 : index + 1) : index === 0 ? last : index - 1;
                  setTab(POST_TABS.at(next)!.id);
                  tabRefs.current.at(next)?.focus();
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`} className="cities-hub__panel">
            {shown.length > 0 ? (
              <ul className="cities__cards">
                {shown.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="cities-home__request" onClick={() => setOpenPost(p)}>
                      <span className="cities-home__request-copy">
                        <span className="cities-home__request-title">{postTitle(p.content)}</span>
                        {postBody(p.content) ? <span className="cities-home__request-body">{postBody(p.content)}</span> : null}
                        {p.audience ? <span className="cities-home__request-audience">Visible to: {p.audience.label}</span> : null}
                        <span className="cities-home__request-meta">
                          {p.kind ? <span className="cities__chip cities-home__kind">{KIND_LABEL[p.kind]}</span> : null}
                          {[
                            p.isMine ? "You" : `${firstName(p.authorFullName)}${yy(p.authorBatchYear) ? ` ${yy(p.authorBatchYear)}` : ""}`,
                            formatRelativeTime(p.createdAt),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="cities-home__chevron" aria-hidden>
                        ›
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : loadingAll && !all ? (
              <p className="cities__note" role="status">
                Loading…
              </p>
            ) : source.length > 0 ? (
              <p className="cities__note">No {POST_TABS.find((t) => t.id === tab)!.label.toLowerCase()} in {city} right now.</p>
            ) : (
              <CityEmptyPrompt key={data.place.placeId} city={city} placeId={data.place.placeId} onAsk={() => onAsk({})} />
            )}
            {canViewAll ? (
              <button type="button" className="cities__link cities-hub__viewall" disabled={loadingAll} onClick={() => void openAll()}>
                {loadingAll ? "Loading…" : "View all posts"}
              </button>
            ) : null}
            {all?.nextCursor ? (
              <button type="button" className="cities__secondary" disabled={loadingAll} onClick={() => void loadMore()}>
                {loadingAll ? "Loading…" : "Show more"}
              </button>
            ) : null}
          </div>
        </section>
      </div>

      {openPost ? (
        <CitySheet
          eyebrow={`Post in ${city}`}
          title={postTitle(openPost.content) || "Post"}
          subtitle={[
            openPost.isMine ? "You" : `${openPost.authorFullName}${yy(openPost.authorBatchYear) ? ` ${yy(openPost.authorBatchYear)}` : ""}`,
            formatRelativeTime(openPost.createdAt),
          ]
            .filter(Boolean)
            .join(" · ")}
          onClose={() => setOpenPost(null)}
        >
          {openPost.kind ? (
            <p className="cities__chips">
              <span className="cities__chip">{KIND_LABEL[openPost.kind]}</span>
            </p>
          ) : null}
          <PostAudienceLabel label={openPost.audience?.label ?? null} />
          {postBody(openPost.content) ? <p className="cities__post">{postBody(openPost.content)}</p> : null}
          <WallShareButton postId={openPost.id} audienceLabel={openPost.audience?.label ?? null} variant="labelled" />
        </CitySheet>
      ) : null}
    </>
  );
}
