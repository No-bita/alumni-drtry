import { useState } from "react";
import { Link } from "react-router-dom";
import { formatRelativeTime } from "../../lib/formatRelativeTime";
import { splitBulletinPostBody, stripBulletinUiCategory } from "../../lib/bulletinPostCardUtils";
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

export type CityAskStarter = { headline?: string; body?: string };

/** File: `apps/web/public/media/city-hero-placeholder.jpg`, served under the app base (`/app/media/...`). */
const CITY_HERO_PLACEHOLDER = publicAsset("media/city-hero-placeholder.jpg");

function postTitle(content: string): string {
  const { title } = splitBulletinPostBody(stripBulletinUiCategory(content));
  return title.trim();
}

function postBody(content: string): string {
  const { summary } = splitBulletinPostBody(stripBulletinUiCategory(content));
  return (summary ?? "").trim();
}

type Shortcut = {
  id: "housing" | "neighbourhoods" | "services" | "people";
  label: string;
  example: string;
  icon: "home" | "pin" | "wrench" | "people";
  /** Starting headline for the Wall composer; the member edits it before posting. */
  starter: (city: string) => string;
};

const KIND_LABEL = { ask: "Ask", offer: "Offer", invitation: "Invitation" } as const;

const SHORTCUTS: Shortcut[] = [
  {
    id: "housing",
    label: "Housing & flatmates",
    example: "Flats, flatmates and housing leads",
    icon: "home",
    starter: (city) => `Housing or flatmates in ${city}`,
  },
  {
    id: "neighbourhoods",
    label: "Neighborhoods",
    example: "Where to live and how to get around",
    icon: "pin",
    starter: (city) => `Neighbourhoods or commute in ${city}`,
  },
  {
    id: "services",
    label: "Local services",
    example: "Doctors, internet, repairs and everyday needs",
    icon: "wrench",
    starter: (city) => `Local services in ${city}`,
  },
  {
    id: "people",
    label: "Meet people",
    example: "Local groups, coffee meetups and things to do",
    icon: "people",
    starter: (city) => `Meeting people in ${city}`,
  },
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

function PenIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

/**
 * The city landing for someone who lives here (local) or just arrived (newcomer), needs first: four task
 * shortcuts that prefill a Wall ask, the city's open Wall requests, then one open ask. Requests open
 * read-only; there are no reply counts or buttons here while the response model is unsettled.
 */
export function CityHome({
  data,
  profileId,
  onChanged,
  onOptIn,
  onAsk,
  onNotice,
}: {
  data: CityPayload;
  profileId: string | null;
  onChanged: () => void;
  onOptIn: () => void;
  onAsk: (starter: CityAskStarter) => void;
  onNotice: (text: string) => void;
}) {
  const city = data.place.city;
  const newcomer = data.viewerRole === "newcomer" && data.myArrival !== null;
  const [stopping, setStopping] = useState(false);
  const [openPost, setOpenPost] = useState<CityPost | null>(null);
  /** "View all posts" expansion: null until opened, then the full paged list. */
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

  const posts = all ? all.posts : data.posts;
  const directoryParams = new URLSearchParams({ residenceCity: city });
  if (data.place.country) directoryParams.set("residenceCountry", data.place.country);

  return (
    <>
      <header className="cities__header cities-home__hero">
        {/* Shared city photo; source and license remain linked. */}
        <div className="cities-home__photohero">
          <img className="cities-home__photohero-img" src={CITY_HERO_PLACEHOLDER} alt="" />
          <span className="cities-home__photohero-shade" aria-hidden />
          <h1 className="cities-home__photohero-city">{city}</h1>
          <span className="cities-home__photohero-badge">
            {data.viewerRole === "local" || data.viewerRole === "newcomer" ? "Your city" : "Exploring"}
          </span>
          <p className="cities-home__photohero-credit">
            Photo:{" "}
            <a
              href="https://commons.wikimedia.org/wiki/File:Vidhan_Soudha_-_Bangalore.jpg"
              target="_blank"
              rel="noreferrer"
            >
              AjayTorvi
            </a>{" "}
            ·{" "}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">
              CC BY-SA 4.0
            </a>
          </p>
        </div>
        {newcomer ? (
          <>
            <p className="cities__count">
              Shown as new to local alumni for {data.myArrival!.daysLeft} more {data.myArrival!.daysLeft === 1 ? "day" : "days"}
            </p>
            <button type="button" className="cities__textbtn" disabled={stopping} onClick={() => void stop()}>
              Stop showing me as new
            </button>
          </>
        ) : null}
      </header>

      {/* Offers stay visible to the newcomer after "Stop showing me as new" (until their 30 days end). */}
      {newcomer || data.offers.length > 0 ? (
        <NewcomerOffersSection offers={data.offers} previousCity={data.myArrival?.previousCity ?? null} onChanged={onChanged} />
      ) : null}

      <section className="cities__section" aria-labelledby="cities-home-need">
        <h2 id="cities-home-need" className="cities-home__title">
          What do you need in {city}?
        </h2>
        <ul className="cities-home__tiles">
          {SHORTCUTS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="cities-home__tile"
                onClick={() => onAsk({ headline: s.starter(city) })}
              >
                <span className="cities-home__tile-icon">
                  <ShortcutIcon icon={s.icon} />
                </span>
                <span className="cities-home__tile-copy">
                  <span className="cities-home__tile-label">{s.label}</span>
                  <span className="cities-home__tile-example">{s.example}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="cities-home__cols">
        <section className="cities__section" aria-labelledby="cities-home-requests">
          <div className="cities__head cities__head--row cities-home__reqhead">
          <h2 id="cities-home-requests" className="cities__h2">
            From the {city} community
          </h2>
          {!all && data.postsHasMore ? (
            <button type="button" className="cities__link" disabled={loadingAll} onClick={() => void openAll()}>
              {loadingAll ? "Loading…" : "View all posts →"}
            </button>
          ) : null}
        </div>
        <p className="cities__note">Open posts from the Wall, filtered to {city}.</p>
        {posts.length > 0 ? (
          <ul className="cities__cards">
            {posts.map((p) => (
              <li key={p.id}>
                <button type="button" className="cities-home__request" onClick={() => setOpenPost(p)}>
                  <span className="cities-home__request-copy">
                    <span className="cities-home__request-title">{postTitle(p.content)}</span>
                    {postBody(p.content) ? <span className="cities-home__request-body">{postBody(p.content)}</span> : null}
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
        ) : (
          <CityEmptyPrompt key={data.place.placeId} city={city} placeId={data.place.placeId} onAsk={() => onAsk({})} />
        )}
        {all?.nextCursor ? (
          <button type="button" className="cities__secondary" disabled={loadingAll} onClick={() => void loadMore()}>
            {loadingAll ? "Loading…" : "Show more"}
          </button>
        ) : null}
        </section>

        <div className="cities-home__side">
          <section className="cities__section" aria-labelledby="cities-home-ask">
        <div className="cities-home__askcard">
          <span className="cities-home__tile-icon">
            <PenIcon />
          </span>
          <div className="cities-home__ask-copy">
            <h2 id="cities-home-ask" className="cities-home__ask-title">
              Can’t find what you need?
            </h2>
            <p className="cities-home__ask-note">
              Ask the {city} community. A specific question, a useful lead or anything you’re figuring out.
            </p>
          </div>
          <button type="button" className="cities-home__askbtn" onClick={() => onAsk({})}>
            Ask the community
          </button>
        </div>
      </section>

      <section className="cities__section cities-home__secondary" aria-label="More">
        <Link to={`/search?${directoryParams.toString()}`} className="cities__link">
          Browse the {city} alumni directory ›
        </Link>
        {data.arrivalPrompt && !newcomer ? (
          <button type="button" className="cities__link" onClick={onOptIn}>
            Just moved? Show me as new in town ›
          </button>
        ) : null}
            {profileId ? (
              <Link to={`/profiles/${profileId}?edit=city`} className="cities__link">
                Moved away? Update your city ›
              </Link>
            ) : null}
          </section>
        </div>
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
          {postBody(openPost.content) ? <p className="cities__post">{postBody(openPost.content)}</p> : null}
        </CitySheet>
      ) : null}
    </>
  );
}
