import {
  type CSSProperties,
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Nav } from "../components/Nav";
import { Avatar } from "../components/Avatar";
import { Button } from "../components/Button";
import type { MessagingOpenDraftDetail } from "../components/GlobalMessagingWidget";
import { useAuth } from "../contexts/AuthContext";
import { LOCATION_LENS_TOP_CITIES_FALLBACK, type TopCityPick } from "../constants/locationLens";
import {
  type ResidenceCitiesResponse,
  type ResidenceCityAggregate,
  type SearchResult,
} from "../api/client";
import { RESIDENCE_CITIES_AGGREGATE_LIMIT } from "../constants/directorySearch";
import { assertApiGet } from "../lib/assertApiGet";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";
import { queryKeys } from "../lib/queryKeys";
import {
  CITY_EVENTS,
  CITY_NEEDS,
  matchCityItem,
  type CityEventItem,
  type CityNeedItem,
} from "../constants/citiesSupport";
import {
  capLocationRequestText,
  LOCATION_REQUEST_DESCRIPTION_MAX_CHARS,
  LOCATION_REQUEST_TITLE_MAX_CHARS,
} from "../constants/requestPostDisplay";
import { IconCalendar, IconCity, IconHelp, IconMapPin, IconUsers } from "../components/LocationPageIcons";
import { humanizeCityIntentSlug, normalizeCityIntentSlug } from "../lib/cityIntentFromToolbar";
import { isDevHubPagesEnabled } from "../lib/devHubPages";
import { CITY_DRAFT_NOTE, CITY_EVENT_SAVED_NOTICE, CITY_REQUEST_SAVED_NOTICE } from "../lib/cityDraftCopy";
import { loadCityDrafts, saveCityDrafts } from "../lib/cityDraftStorage";
import "../styles/city-draft-board.css";

const DEFAULT_CITY_PICK: TopCityPick = { city: "Bengaluru", country: "India" };

const HIGHLIGHT_CREATE_REQUEST_QUERY = "highlightCreateRequest";
const HIGHLIGHT_NAV_SEARCH_QUERY = "highlightNavSearch";

/** Empty feed on the location hub — same message for every city so the page feels consistent while content is sparse. */
const LOCATION_PAGE_EMPTY_POSTS_COPY =
  "No posts to show yet—this hub is quiet across cities for now. Switch city above or add a request or event below.";

/** City-only slug hubs (opened via @)—directory search skips country; explain instead of implying zero alumni forever. */
const LOCATION_UNKNOWN_REGION_PEOPLE_COPY =
  "We're not querying directory residency without a mapped region yet—browse Search to find alumni, or add a request for this hub.";

/**
 * Prefer merge list from `/v1/directory/residence-cities` so any surfaced city slug (e.g. Pune) resolves.
 */
function resolveCityFromSlug(citySlug: string | undefined, residenceRows: ResidenceCityAggregate[] | undefined): TopCityPick {
  if (!citySlug?.trim()) return DEFAULT_CITY_PICK;
  const normalizedSlug = normalizeCityIntentSlug(citySlug);
  if (!normalizedSlug) return DEFAULT_CITY_PICK;

  if (normalizedSlug === "bengaluru" || normalizedSlug === "bangalore") {
    return DEFAULT_CITY_PICK;
  }

  if (residenceRows?.length) {
    for (const raw of residenceRows) {
      const row = canonicalResidenceCityRow(raw);
      if (normalizeCityIntentSlug(row.city) === normalizedSlug) {
        return { city: row.city, country: row.country };
      }
    }
  }

  const cityPool = [
    ...LOCATION_LENS_TOP_CITIES_FALLBACK.map(({ city, country }) => ({ city, country })),
    ...CITY_NEEDS.map(({ city, country }) => ({ city, country })),
    ...CITY_EVENTS.map(({ city, country }) => ({ city, country })),
  ];
  for (const pick of cityPool) {
    if (normalizeCityIntentSlug(pick.city) === normalizedSlug) {
      return { city: pick.city, country: pick.country };
    }
  }

  return { city: humanizeCityIntentSlug(normalizedSlug), country: "" };
}

function cityLabel(city: string, country: string): string {
  const cCity = city.trim();
  const cCountry = country.trim();
  return cCountry ? `${cCity}, ${cCountry}` : cCity;
}

function cityIntentPath(city: string): string {
  return `/intent/location/${normalizeCityIntentSlug(city)}`;
}

/** Normalizes spellings API may split (e.g. Bangalore vs Bengaluru). */
function canonicalResidenceCityRow(row: ResidenceCityAggregate): ResidenceCityAggregate {
  const country = row.country.trim();
  const city = row.city.trim();
  if (country.toLowerCase() === "india" && city.toLowerCase() === "bangalore") {
    return { ...row, city: "Bengaluru", country };
  }
  return { ...row, city, country };
}

function residenceCityAggregateKey(row: Pick<ResidenceCityAggregate, "city" | "country">): string {
  return `${normalizeCityIntentSlug(row.city)}|||${normalizeCityIntentSlug(row.country)}`;
}

/** Merges duplicate keys and keeps rows sorted by alumni count (desc). */
function dedupeMergedResidenceCities(rows: ResidenceCityAggregate[]): ResidenceCityAggregate[] {
  const map = new Map<string, ResidenceCityAggregate>();
  for (const raw of rows) {
    const row = canonicalResidenceCityRow(raw);
    const key = residenceCityAggregateKey(row);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, row);
    } else {
      map.set(key, { ...row, city: prev.city, country: prev.country, count: prev.count + row.count });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/** Fewer pills = wider tiles; strip width still matches quick-action row below. */
const POPULAR_STRIP_TARGET_COUNT = 6;

/** First N cities from the static catalog — same pills for every viewing city; selection only affects highlight + page content via URL. */
function buildPopularCityStripRows(target: number): ResidenceCityAggregate[] {
  const out: ResidenceCityAggregate[] = [];
  for (const pick of LOCATION_LENS_TOP_CITIES_FALLBACK) {
    out.push(canonicalResidenceCityRow({ city: pick.city, country: pick.country, count: 0 }));
    if (out.length >= target) break;
  }
  return out;
}

const POPULAR_STRIP_ROWS = buildPopularCityStripRows(POPULAR_STRIP_TARGET_COUNT);

/** Explore grid order: canonical fallback list first, then any API-only cities alphabetically — counts come from API when present. */
function exploreCitiesStableCatalog(apiRowsRaw: ResidenceCityAggregate[]): ResidenceCityAggregate[] {
  const mergedApi = apiRowsRaw.length ? dedupeMergedResidenceCities(apiRowsRaw) : [];
  const byKey = new Map<string, ResidenceCityAggregate>();
  for (const row of mergedApi) {
    const c = canonicalResidenceCityRow(row);
    byKey.set(residenceCityAggregateKey(c), c);
  }

  const seen = new Set<string>();
  const out: ResidenceCityAggregate[] = [];
  for (const pick of LOCATION_LENS_TOP_CITIES_FALLBACK) {
    const skeleton = canonicalResidenceCityRow({ city: pick.city, country: pick.country, count: 0 });
    const key = residenceCityAggregateKey(skeleton);
    seen.add(key);
    out.push(byKey.get(key) ?? skeleton);
  }

  const extras: ResidenceCityAggregate[] = [];
  for (const row of mergedApi) {
    const c = canonicalResidenceCityRow(row);
    const key = residenceCityAggregateKey(c);
    if (!seen.has(key)) extras.push(c);
  }
  extras.sort((a, b) => {
    const la = `${a.country.toLowerCase()}\u0000${a.city.toLowerCase()}`;
    const lb = `${b.country.toLowerCase()}\u0000${b.city.toLowerCase()}`;
    return la.localeCompare(lb);
  });
  return [...out, ...extras];
}

type ExploreRegion = "all" | "asia" | "europe" | "north_america" | "oceania" | "middle_east" | "africa";

const EXPLORE_REGION_TABS: Array<{ id: ExploreRegion; label: string }> = [
  { id: "all", label: "All" },
  { id: "asia", label: "Asia" },
  { id: "europe", label: "Europe" },
  { id: "north_america", label: "North America" },
  { id: "oceania", label: "Oceania" },
  { id: "middle_east", label: "Middle East" },
  { id: "africa", label: "Africa" },
];

function regionForCountry(country: string): ExploreRegion {
  const c = country.trim().toLowerCase();
  if (["india", "singapore", "japan", "china", "south korea"].includes(c)) return "asia";
  if (["uk", "united kingdom", "germany", "france", "spain", "italy", "netherlands"].includes(c)) return "europe";
  if (["usa", "united states", "canada", "mexico"].includes(c)) return "north_america";
  if (["australia", "new zealand"].includes(c)) return "oceania";
  if (["uae", "saudi arabia", "qatar", "oman", "kuwait"].includes(c)) return "middle_east";
  if (["south africa", "kenya", "nigeria", "egypt", "ghana", "morocco"].includes(c)) return "africa";
  return "asia";
}

function flagForCountry(country: string): string {
  const c = country.trim().toLowerCase();
  const map: Record<string, string> = {
    india: "🇮🇳",
    usa: "🇺🇸",
    "united states": "🇺🇸",
    canada: "🇨🇦",
    uk: "🇬🇧",
    "united kingdom": "🇬🇧",
    uae: "🇦🇪",
    singapore: "🇸🇬",
    australia: "🇦🇺",
    germany: "🇩🇪",
    france: "🇫🇷",
    japan: "🇯🇵",
  };
  return map[c] ?? "🌍";
}

function humanNeedType(type: CityNeedItem["type"]): string {
  switch (type) {
    case "housing":
      return "Housing";
    case "accommodation":
      return "Short stay";
    case "sports_activity":
      return "Activities";
    case "city_help":
      return "General";
    default:
      return "General";
  }
}

/** Only when the post has an author profile id from the backend (creator). */
function cityNeedPosterProfileHref(need: CityNeedItem): string | null {
  const id = need.askedByPersonId?.trim();
  return id ? `/profiles/${id}` : null;
}

export function LocationPage() {
  const { citySlug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = useAuth();
  const profile = auth.status === "authenticated" ? auth.myProfile : null;
  const upcomingEventsScrollRef = useRef<HTMLUListElement | null>(null);
  const requestsPanelRef = useRef<HTMLElement | null>(null);
  const sideStackRef = useRef<HTMLElement | null>(null);
  const composerPanelRef = useRef<HTMLElement | null>(null);
  const autoOpenRequestTimerRef = useRef<number | null>(null);
  const [isEventsHovered, setIsEventsHovered] = useState(false);

  const topCitiesQuery = useQuery({
    queryKey: queryKeys.directory.residenceCities(RESIDENCE_CITIES_AGGREGATE_LIMIT),
    queryFn: async ({ signal }) => {
      const data = await assertApiGet<ResidenceCitiesResponse>(
        `/v1/directory/residence-cities?limit=${RESIDENCE_CITIES_AGGREGATE_LIMIT}`,
        signal
      );
      return data.cities ?? [];
    },
    enabled: auth.status === "authenticated",
  });

  const topCitiesRows = useMemo(() => {
    if (topCitiesQuery.data && topCitiesQuery.data.length > 0) {
      return dedupeMergedResidenceCities(topCitiesQuery.data);
    }
    return LOCATION_LENS_TOP_CITIES_FALLBACK.map((p) => ({ ...p, count: 0 }));
  }, [topCitiesQuery.data]);

  const topCitiesLoading = topCitiesQuery.isLoading;
  const topCitiesUpdating = topCitiesQuery.isFetching && !topCitiesQuery.isLoading;
  const topCitiesError =
    topCitiesQuery.error instanceof Error
      ? topCitiesQuery.error.message
      : topCitiesQuery.error
        ? String(topCitiesQuery.error)
        : null;

  const exploreStableCatalogRows = useMemo(
    () => exploreCitiesStableCatalog(topCitiesQuery.data ?? []),
    [topCitiesQuery.data],
  );

  const resolvedPick = useMemo(
    () => resolveCityFromSlug(citySlug, topCitiesRows),
    [citySlug, topCitiesRows],
  );

  const [selected, setSelected] = useState<TopCityPick>(() => resolveCityFromSlug(citySlug, undefined));

  if (selected.city !== resolvedPick.city || selected.country !== resolvedPick.country) {
    setSelected(resolvedPick);
  }
  const cityStripCols = Math.max(1, POPULAR_STRIP_ROWS.length);

  const cityStripGridStyle = {
    "--city-strip-cols": cityStripCols,
  } as CSSProperties;

  const [activeNeed, setActiveNeed] = useState<CityNeedItem["type"] | "all">("all");
  const [activeExploreRegion, setActiveExploreRegion] = useState<ExploreRegion>("all");
  // Drafts stay in this browser (localStorage), kept per signed-in person so a shared device does not mix them.
  const draftOwner = auth.status === "authenticated" ? auth.person.personId : "guest";
  const [draftsOwner, setDraftsOwner] = useState(draftOwner);
  const [createdNeeds, setCreatedNeeds] = useState<CityNeedItem[]>(() => loadCityDrafts<CityNeedItem>(draftOwner, "needs"));
  const [createdEvents, setCreatedEvents] = useState<CityEventItem[]>(() => loadCityDrafts<CityEventItem>(draftOwner, "events"));
  if (draftsOwner !== draftOwner) {
    setDraftsOwner(draftOwner);
    setCreatedNeeds(loadCityDrafts<CityNeedItem>(draftOwner, "needs"));
    setCreatedEvents(loadCityDrafts<CityEventItem>(draftOwner, "events"));
  }
  useEffect(() => {
    if (draftsOwner === draftOwner) saveCityDrafts(draftOwner, "needs", createdNeeds);
  }, [draftOwner, draftsOwner, createdNeeds]);
  useEffect(() => {
    if (draftsOwner === draftOwner) saveCityDrafts(draftOwner, "events", createdEvents);
  }, [draftOwner, draftsOwner, createdEvents]);
  const [highlightCreateRequestCta, setHighlightCreateRequestCta] = useState(false);
  const [composerMode, setComposerMode] = useState<null | "request" | "event">(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const [requestForm, setRequestForm] = useState({
    title: "",
    type: "housing" as CityNeedItem["type"],
    description: "",
  });
  const [eventForm, setEventForm] = useState({
    title: "",
    date: "",
    time: "",
    venue: "",
  });

  const cityNeeds = useMemo(
    () => [...createdNeeds, ...CITY_NEEDS].filter((item) => matchCityItem(item, selected.city, selected.country)),
    [selected, createdNeeds]
  );
  const filteredNeeds = useMemo(
    () => cityNeeds.filter((item) => (activeNeed === "all" ? true : item.type === activeNeed)),
    [cityNeeds, activeNeed]
  );
  const requestTabCounts = useMemo(
    () =>
      cityNeeds.reduce<Record<CityNeedItem["type"], number>>(
        (acc, item) => {
          acc[item.type] += 1;
          return acc;
        },
        {
          housing: 0,
          accommodation: 0,
          sports_activity: 0,
          city_help: 0,
        }
      ),
    [cityNeeds]
  );

  const cityEvents = useMemo(
    () => [...createdEvents, ...CITY_EVENTS].filter((item) => matchCityItem(item, selected.city, selected.country)).slice(0, 2),
    [selected, createdEvents]
  );
  const residenceHubHasCountry = selected.country.trim().length > 0;

  const peopleQuery = useQuery({
    queryKey: ["cities", "people", selected.city, selected.country],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        residenceCity: selected.city,
        residenceCountry: selected.country,
        requireResidence: "true",
        limit: "24",
      });
      return assertApiGet<SearchResult>(`/v1/search?${params.toString()}`, signal);
    },
    enabled: auth.status === "authenticated" && residenceHubHasCountry,
  });
  const people = peopleQuery.data?.results ?? [];
  const peopleLoading = peopleQuery.isLoading;
  const peopleUpdating = peopleQuery.isFetching && !peopleQuery.isLoading;
  const peopleError =
    peopleQuery.error instanceof Error
      ? peopleQuery.error.message
      : peopleQuery.error
        ? String(peopleQuery.error)
        : null;

  const visiblePeople = people.slice(0, 5);
  const extraPeople = Math.max(0, people.length - visiblePeople.length);

  /** Match Active requests panel height to the right column stack on desktop so the hub row stays fixed and the list scrolls. */
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const panel = requestsPanelRef.current;
    if (!panel) return;
    const mq = window.matchMedia("(min-width: 1121px)");

    const applyRequestsCapFromSideStack = () => {
      if (!mq.matches) {
        panel.style.removeProperty("--location-requests-cap");
        return;
      }
      const side = sideStackRef.current;
      if (!side) {
        panel.style.removeProperty("--location-requests-cap");
        return;
      }
      const h = Math.round(side.getBoundingClientRect().height);
      if (h > 0) {
        panel.style.setProperty("--location-requests-cap", `${h}px`);
      } else {
        panel.style.removeProperty("--location-requests-cap");
      }
    };

    applyRequestsCapFromSideStack();
    const side = sideStackRef.current;
    const ro = new ResizeObserver(applyRequestsCapFromSideStack);
    if (side) {
      ro.observe(side);
    }
    mq.addEventListener("change", applyRequestsCapFromSideStack);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", applyRequestsCapFromSideStack);
      panel.style.removeProperty("--location-requests-cap");
    };
  }, [people.length, peopleLoading, cityEvents.length]);

  const displayName =
    auth.status === "authenticated"
      ? (profile?.fullName ?? "").trim() ||
          profile?.fullName?.trim() ||
          displayFirstNameFromEmail(auth.person.institutionalEmail)
      : "";

  const myPersonId = auth.status === "authenticated" ? auth.person.personId : null;

  function openMessagingForCityNeed(need: CityNeedItem) {
    if (!myPersonId) return;
    if (need.askedByPersonId === myPersonId) return;

    if (!need.askedByPersonId) {
      window.dispatchEvent(
        new CustomEvent<MessagingOpenDraftDetail>("messaging:open-draft", { detail: { openPanelOnly: true } })
      );
      return;
    }

    const firstName = need.askedByName.trim().split(/\s+/)[0] ?? "there";
    const titleRef = capLocationRequestText(need.title, LOCATION_REQUEST_TITLE_MAX_CHARS);
    const initialMessage = `Hi ${firstName},\nI'm messaging about your city request: "${titleRef}"\n`.slice(0, 300);

    window.dispatchEvent(
      new CustomEvent<MessagingOpenDraftDetail>("messaging:open-draft", {
        detail: {
          recipientPersonId: need.askedByPersonId,
          recipientName: need.askedByName,
          initialMessage,
          kind: "general",
          requestTitle: titleRef,
          recipientDepartmentCode: need.askedByDepartmentCode,
          recipientBatchYear: need.askedByBatchYear,
        },
      })
    );
  }

  const requestTabs = [
    { id: "housing" as const, label: "Housing" },
    {
      id: "accommodation" as const,
      label: "Short stays",
    },
    {
      id: "sports_activity" as const,
      label: "Activities",
    },
    { id: "city_help" as const, label: "General" },
  ] as const;

  function selectCity(next: TopCityPick) {
    const nextPath = cityIntentPath(next.city);
    if (nextPath !== `/intent/location/${citySlug ?? ""}`) {
      navigate(nextPath);
    }
  }

  useEffect(() => {
    const container = upcomingEventsScrollRef.current;
    if (!container || isEventsHovered) return;
    if (container.scrollHeight <= container.clientHeight) return;

    const step = 0.4;
    const tickMs = 30;
    const timer = window.setInterval(() => {
      if (!container.isConnected) return;
      const bottomGap = container.scrollHeight - container.clientHeight - container.scrollTop;
      if (bottomGap <= 1) {
        container.scrollTop = 0;
        return;
      }
      container.scrollTop += step;
    }, tickMs);

    return () => window.clearInterval(timer);
  }, [cityEvents.length, isEventsHovered]);

  function clearAutoOpenRequestTimer() {
    if (autoOpenRequestTimerRef.current == null) return;
    window.clearTimeout(autoOpenRequestTimerRef.current);
    autoOpenRequestTimerRef.current = null;
  }

  function scheduleCreateRequestAutoOpen() {
    clearAutoOpenRequestTimer();
    autoOpenRequestTimerRef.current = window.setTimeout(() => {
      openComposer("request");
    }, 1000);
  }

  function showHousingRequests() {
    setActiveNeed("housing");
    window.requestAnimationFrame(() => {
      document.querySelector(".cities-redesign__tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function openComposer(mode: "request" | "event") {
    clearAutoOpenRequestTimer();
    setHighlightCreateRequestCta(false);
    setComposerError(null);
    setComposerNotice(null);
    setComposerMode(mode);
  }

  useEffect(() => {
    if (searchParams.get(HIGHLIGHT_CREATE_REQUEST_QUERY) !== "1") return;
    queueMicrotask(() => {
      setHighlightCreateRequestCta(true);
      const next = new URLSearchParams(searchParams);
      next.delete(HIGHLIGHT_CREATE_REQUEST_QUERY);
      setSearchParams(next, { replace: true });
      window.requestAnimationFrame(() => {
        composerPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      clearAutoOpenRequestTimer();
      autoOpenRequestTimerRef.current = window.setTimeout(() => {
        clearAutoOpenRequestTimer();
        setHighlightCreateRequestCta(false);
        setComposerError(null);
        setComposerNotice(null);
        setComposerMode("request");
      }, 1000);
    });
  }, [searchParams, setSearchParams]);

  function focusCreateRequestComposer() {
    setHighlightCreateRequestCta(true);
    window.requestAnimationFrame(() => {
      composerPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    scheduleCreateRequestAutoOpen();
  }

  function nudgeTopSearchForPeople() {
    const next = new URLSearchParams(searchParams);
    next.set(HIGHLIGHT_NAV_SEARCH_QUERY, "1");
    setSearchParams(next, { replace: true });
  }

  useEffect(() => {
    return () => {
      clearAutoOpenRequestTimer();
    };
  }, []);

  function closeComposer() {
    setComposerMode(null);
    setComposerError(null);
  }

  function formatEventStartsAtLabel(dateValue: string, timeValue: string): string {
    const parsedDate = new Date(dateValue);
    const weekday = Number.isNaN(parsedDate.getTime())
      ? dateValue
      : parsedDate.toLocaleDateString("en-US", { weekday: "short" });
    const [hoursRaw, minutesRaw] = timeValue.split(":");
    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return `${weekday} · ${timeValue}`;
    const suffix = hours >= 12 ? "PM" : "AM";
    const hours12 = hours % 12 === 0 ? 12 : hours % 12;
    const paddedMinutes = String(minutes).padStart(2, "0");
    return `${weekday} · ${hours12}:${paddedMinutes} ${suffix}`;
  }

  function handleCreateRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!myPersonId) return;
    const hubCity = selected.city.trim();
    const hubCountry = selected.country.trim();
    if (!requestForm.title.trim() || !requestForm.description.trim() || !hubCity || !hubCountry) {
      setComposerError(
        hubCity && !hubCountry
          ? "Pick a region for this city hub before posting a request."
          : "Please complete all required fields for the request."
      );
      return;
    }
    const departmentCode = profile?.departmentCode?.toUpperCase() ?? "ALUM";
    const batchYear = profile?.batchYear ?? new Date().getFullYear();
    const askedByName =
      (profile?.fullName ?? "").trim() || profile?.fullName?.trim() || displayName || "Alumni member";
    setCreatedNeeds((prev) => [
      {
        id: `need-local-${Date.now()}`,
        city: hubCity,
        country: hubCountry,
        type: requestForm.type,
        askedByName,
        askedByDepartmentCode: departmentCode,
        askedByBatchYear: batchYear,
        askedByPersonId: myPersonId,
        title: requestForm.title.trim().slice(0, LOCATION_REQUEST_TITLE_MAX_CHARS),
        description: requestForm.description.trim().slice(0, LOCATION_REQUEST_DESCRIPTION_MAX_CHARS),
      },
      ...prev,
    ]);
    setRequestForm({ title: "", type: "housing", description: "" });
    setComposerMode(null);
    setComposerError(null);
    setComposerNotice(CITY_REQUEST_SAVED_NOTICE);
  }

  function handleCreateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const hubCity = selected.city.trim();
    const hubCountry = selected.country.trim();
    if (!eventForm.title.trim() || !eventForm.date || !eventForm.time || !eventForm.venue.trim() || !hubCity || !hubCountry) {
      setComposerError(
        hubCity && !hubCountry
          ? "Pick a region for this city hub before creating an event."
          : "Please complete title, date, time, and venue for the event."
      );
      return;
    }
    setCreatedEvents((prev) => [
      {
        id: `event-local-${Date.now()}`,
        city: hubCity,
        country: hubCountry,
        title: eventForm.title.trim(),
        startsAtLabel: formatEventStartsAtLabel(eventForm.date, eventForm.time),
        venue: eventForm.venue.trim(),
        attendeeCount: 0,
      },
      ...prev,
    ]);
    setEventForm({ title: "", date: "", time: "", venue: "" });
    setComposerMode(null);
    setComposerError(null);
    setComposerNotice(CITY_EVENT_SAVED_NOTICE);
  }

  return (
    <div className="intent-page-shell">
      <Nav
        variant="home"
        avatarName={displayName}
        appToolbarLead={
          <div className="nav-app-toolbar__welcome">
            <h1 id="location-toolbar-title" className="nav-app-toolbar__welcome-title nav-app-toolbar__welcome-title--location-page">
              {cityLabel(selected.city, selected.country)}
            </h1>
          </div>
        }
      />
      <main className="cities-v2 cities-redesign">
        <section className="cities-v2__popular ds-surface-card" aria-label="Popular cities">
          <>
            <ul className="cities-v2__popular-strip cities-v2__popular-strip--fill" style={cityStripGridStyle}>
              {POPULAR_STRIP_ROWS.map((row) => {
                const picked = selected.city === row.city && selected.country === row.country;
                return (
                  <li key={`${row.city}-${row.country}-popular`} className="cities-v2__popular-strip-cell">
                    <button
                      type="button"
                      aria-pressed={picked}
                      aria-label={cityLabel(row.city, row.country)}
                      className={`cities-v2__city-pick${picked ? " cities-v2__city-pick--selected" : ""}`}
                      onClick={() => {
                        selectCity({ city: row.city, country: row.country });
                        setActiveNeed("all");
                      }}
                    >
                      <span className="cities-v2__city-pick-icon" aria-hidden>
                        <IconMapPin />
                      </span>
                      <span className="cities-v2__city-pick-city">{row.city}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {topCitiesLoading ? <p className="cities-redesign__state">Loading city stats…</p> : null}
            {topCitiesError ? <p className="cities-redesign__state cities-redesign__state--error">{topCitiesError}</p> : null}
            {topCitiesUpdating ? <p className="cities-redesign__updating">Updating city stats…</p> : null}
          </>
        </section>

        <section className="cities-redesign__quick">
          <h2 className="cities-redesign__section-title">What do you want to do?</h2>
          <div className="cities-redesign__quick-grid">
            <button type="button" className="cities-redesign__quick-card" onClick={nudgeTopSearchForPeople}>
              <span className="cities-redesign__quick-icon"><IconUsers /></span>
              <div>
                <p className="cities-redesign__quick-title">Find people</p>
                <p className="cities-redesign__quick-copy">Connect with alumni in your city</p>
              </div>
            </button>
            <button type="button" className="cities-redesign__quick-card" onClick={focusCreateRequestComposer}>
              <span className="cities-redesign__quick-icon"><IconHelp /></span>
              <div>
                <p className="cities-redesign__quick-title">Ask for help</p>
                <p className="cities-redesign__quick-copy">Draft a request and line up help from alumni</p>
              </div>
            </button>
            <button type="button" className="cities-redesign__quick-card" onClick={showHousingRequests}>
              <span className="cities-redesign__quick-icon"><IconCity /></span>
              <div>
                <p className="cities-redesign__quick-title">Find housing</p>
                <p className="cities-redesign__quick-copy">Flats, flatmates, and short stays</p>
              </div>
            </button>
            {isDevHubPagesEnabled ? (
              <Link to="/events" className="cities-redesign__quick-card">
                <span className="cities-redesign__quick-icon"><IconCalendar /></span>
                <div>
                  <p className="cities-redesign__quick-title">Explore events</p>
                  <p className="cities-redesign__quick-copy">Discover events and activities</p>
                </div>
              </Link>
            ) : null}
          </div>
        </section>

        <section className="cities-v2__mid-grid">
          <section ref={requestsPanelRef} className="cities-redesign__requests">
            <header className="cities-redesign__requests-head">
              <h2 className="cities-redesign__section-title">
                City board
              </h2>
              <p className="cities-redesign__draft-note">{CITY_DRAFT_NOTE}</p>
            </header>
            <div className="cities-redesign__tabs">
              {requestTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={activeNeed === tab.id}
                  className={`cities-redesign__tab location-page__request-tab${
                    activeNeed === tab.id ? " location-page__request-tab--selected is-active" : ""
                  }`}
                  onClick={() => setActiveNeed((prev) => (prev === tab.id ? "all" : tab.id))}
                >
                  <span className={`cities-redesign__tab-icon cities-redesign__tab-icon--${tab.id}`} aria-hidden>
                    {tab.id === "housing" ? <IconCity /> : null}
                    {tab.id === "accommodation" ? <IconCity /> : null}
                    {tab.id === "sports_activity" ? <IconUsers /> : null}
                    {tab.id === "city_help" ? <IconHelp /> : null}
                  </span>
                  {tab.label}
                  <span className="cities-redesign__tab-count">{requestTabCounts[tab.id]}</span>
                </button>
              ))}
            </div>
            <div className="cities-redesign__requests-feed">
              {filteredNeeds.length === 0 ? (
                <p className="cities-redesign__state cities-redesign__state--feed-empty" role="status">
                  {LOCATION_PAGE_EMPTY_POSTS_COPY}
                </p>
              ) : (
                <ul
                  className="cities-redesign__request-list cities-redesign__auto-scroll-list cities-redesign__auto-scroll-list--requests"
                  role="list"
                >
                  {filteredNeeds.map((need) => {
                    const titleShown = capLocationRequestText(need.title, LOCATION_REQUEST_TITLE_MAX_CHARS);
                    const descShown = capLocationRequestText(need.description, LOCATION_REQUEST_DESCRIPTION_MAX_CHARS);
                    const profileHref = cityNeedPosterProfileHref(need);
                    const avatarEl = (
                      <Avatar name={need.askedByName} size="lg" tone="pastel" />
                    );
                    return (
                    <li key={need.id} className="cities-redesign__request-row">
                      <div className="cities-redesign__request-main">
                        {profileHref ? (
                          <Link
                            to={profileHref}
                            className="cities-redesign__request-avatar-link"
                            aria-label={`View ${need.askedByName}'s profile`}
                          >
                            {avatarEl}
                          </Link>
                        ) : (
                          avatarEl
                        )}
                        <div>
                          {titleShown.trim() ? (
                            <p className="cities-redesign__request-title" title={need.title}>
                              {titleShown}
                            </p>
                          ) : null}
                          <p className="cities-redesign__request-meta">
                            {need.askedByName} · {need.askedByDepartmentCode} '{String(need.askedByBatchYear).slice(-2)} · 2h ago
                          </p>
                          {descShown.trim() ? (
                            <p className="cities-redesign__request-copy" title={need.description}>
                              {descShown}
                            </p>
                          ) : null}
                          <p className="cities-redesign__request-tags">
                            <span className={`cities-redesign__tag cities-redesign__tag--type cities-redesign__tag--${need.type}`}>
                              {humanNeedType(need.type)}
                            </span>
                            <span className="cities-redesign__tag cities-redesign__tag--location">
                              <span className="cities-redesign__tag-icon" aria-hidden>
                                <IconMapPin />
                              </span>
                              {selected.city}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="cities-redesign__request-actions">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={
                            Boolean(myPersonId) &&
                            Boolean(need.askedByPersonId) &&
                            need.askedByPersonId === myPersonId
                          }
                          title={need.askedByPersonId === myPersonId ? "Your request" : undefined}
                          onClick={() => openMessagingForCityNeed(need)}
                        >
                          Message
                        </Button>
                      </div>
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <aside ref={sideStackRef} className="cities-v2__side-stack">
            {isDevHubPagesEnabled ? (
              <article className="cities-redesign__panel">
                <header className="cities-redesign__panel-head">
                  <h3>Upcoming events</h3>
                </header>
                <div className="cities-redesign__events-feed">
                  {cityEvents.length === 0 ? (
                    <p className="cities-redesign__state cities-redesign__state--feed-empty" role="status">
                      {LOCATION_PAGE_EMPTY_POSTS_COPY}
                    </p>
                  ) : (
                    <ul
                      ref={upcomingEventsScrollRef}
                      className="cities-redesign__event-list cities-redesign__auto-scroll-list cities-redesign__auto-scroll-list--events"
                      onMouseEnter={() => setIsEventsHovered(true)}
                      onMouseLeave={() => setIsEventsHovered(false)}
                    >
                      {cityEvents.map((event) => (
                        <li key={event.id} className="cities-redesign__event-item">
                          <Link
                            to="/events"
                            state={{ eventId: event.id, eventTitle: event.title }}
                            className="cities-redesign__event-link"
                            aria-label={`View details for ${event.title}`}
                          >
                            <div>
                              <p className="cities-redesign__event-title">{event.title}</p>
                              <p className="cities-redesign__event-meta">{event.startsAtLabel} · {event.venue}</p>
                              <p className="cities-redesign__event-attendees">
                                {event.attendeeCount}{" "}
                                {event.attendeeCount === 1 ? "alumnus" : "alumni"} attending
                              </p>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            ) : null}

            <article className="cities-redesign__panel">
              <header className="cities-redesign__panel-head">
                <h3>People in {selected.city}</h3>
              </header>
              <div className="cities-redesign__people-feed">
                {!selected.country.trim() ? (
                  <p className="cities-redesign__state cities-redesign__state--feed-empty" role="status">
                    {LOCATION_UNKNOWN_REGION_PEOPLE_COPY}
                  </p>
                ) : peopleLoading ? (
                  <p className="cities-redesign__state" role="status">
                    Loading people…
                  </p>
                ) : peopleError ? (
                  <p className="cities-redesign__state cities-redesign__state--error" role="alert">
                    {peopleError}
                  </p>
                ) : visiblePeople.length === 0 ? (
                  <p className="cities-redesign__state" role="status">
                    No alumni found for this city yet.
                  </p>
                ) : (
                  <div className="cities-redesign__people-feed-inner">
                    <div className="cities-redesign__people-feed-scroll">
                      <div className="cities-redesign__people-card-grid">
                        {visiblePeople.map((person) => {
                          const rawPersonName = (person.fullName ?? "").trim();
                          const personDisplay = (person.fullName ?? "").trim() || rawPersonName;
                          const firstToken = personDisplay.split(/\s+/)[0] ?? personDisplay;
                          return (
                            <Link
                              key={person.id}
                              to={`/profiles/${person.id}`}
                              className="cities-redesign__person-card"
                            >
                              <Avatar name={personDisplay} size="md" tone="pastel" />
                              <span className="cities-redesign__person-card-name">{firstToken}</span>
                            </Link>
                          );
                        })}
                        {extraPeople > 0 ? (
                          <span className="cities-redesign__person-card cities-redesign__person-card--extra" aria-label={`${extraPeople} more alumni in this city`}>
                            +{extraPeople}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {peopleUpdating ? (
                      <p className="cities-redesign__updating cities-redesign__people-feed-footer" role="status">
                        Updating people…
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </article>

            <article ref={composerPanelRef} className="cities-redesign__panel cities-redesign__composer-card">
              <header className="cities-redesign__panel-head">
                <h3>Create in {selected.city}</h3>
              </header>
              <p className="cities-redesign__composer-copy">
                Add a request or event for alumni in this city. We will prefill your city automatically.
              </p>
              <div className="cities-redesign__composer-actions">
                <Button
                  variant="secondary"
                  className={`cities-redesign__composer-btn cities-redesign__composer-btn--request${
                    highlightCreateRequestCta ? " cities-redesign__composer-btn--highlight" : ""
                  }`}
                  onClick={() => openComposer("request")}
                  title={highlightCreateRequestCta ? "Open the form to post your request for this city" : undefined}
                >
                  Create request
                </Button>
                <Button
                  variant="primary"
                  className="cities-redesign__composer-btn cities-redesign__composer-btn--event"
                  onClick={() => openComposer("event")}
                >
                  Create event
                </Button>
              </div>
            </article>
          </aside>
        </section>
        {composerNotice ? <p className="cities-redesign__composer-notice">{composerNotice}</p> : null}

        <section className="cities-v2__explore ds-surface-card">
          <header className="cities-v2__row-head">
            <h3>Explore all cities</h3>
          </header>
          <div className="cities-v2__explore-tabs" role="tablist" aria-label="Explore cities by region">
            {EXPLORE_REGION_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`cities-v2__explore-tab${activeExploreRegion === tab.id ? " is-active" : ""}`}
                onClick={() => setActiveExploreRegion(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="cities-v2__explore-grid">
            {exploreStableCatalogRows
              .filter((row) => activeExploreRegion === "all" || regionForCountry(row.country) === activeExploreRegion)
              .slice(0, 12)
              .map((row) => (
              <button
                key={`${row.city}-${row.country}-explore`}
                type="button"
                className="cities-v2__explore-item"
                onClick={() => {
                  selectCity({ city: row.city, country: row.country });
                  setActiveNeed("all");
                }}
              >
                <span className="cities-v2__explore-item-label">
                  <span aria-hidden>{flagForCountry(row.country)}</span>
                  <span>{cityLabel(row.city, row.country)}</span>
                </span>
                <span className="cities-v2__explore-item-count">{row.count} active</span>
              </button>
            ))}
          </div>
        </section>

        {composerMode ? (
          <div className="cities-redesign__composer-overlay" role="presentation" onClick={closeComposer}>
            <section
              className="cities-redesign__composer-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={composerMode === "request" ? "Create request" : "Create event"}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="cities-redesign__composer-head">
                <h3>{composerMode === "request" ? "Draft a request" : "Draft an event"}</h3>
                <button type="button" className="cities-redesign__composer-close" onClick={closeComposer}>
                  Close
                </button>
              </header>
              {composerMode === "request" ? (
                <form className="cities-redesign__composer-form" onSubmit={handleCreateRequest}>
                  <label className="cities-redesign__composer-field">
                    <span className="cities-redesign__composer-field-label">
                      <span>Request title</span>
                    </span>
                    <div className="cities-redesign__composer-input-wrap">
                      <input
                        className="input cities-redesign__composer-input cities-redesign__composer-input--single-line"
                        value={requestForm.title}
                        maxLength={LOCATION_REQUEST_TITLE_MAX_CHARS}
                        onChange={(event) => setRequestForm((prev) => ({ ...prev, title: event.target.value }))}
                        placeholder="e.g. Looking for a flatmate near Koramangala"
                        required
                        aria-describedby="location-request-title-counter"
                      />
                      <span
                        id="location-request-title-counter"
                        className="cities-redesign__composer-char-count cities-redesign__composer-char-count--inside"
                        aria-live="polite"
                      >
                        {requestForm.title.length} / {LOCATION_REQUEST_TITLE_MAX_CHARS}
                      </span>
                    </div>
                  </label>
                  <label className="cities-redesign__composer-field">
                    <span>Category</span>
                    <select
                      className="input"
                      value={requestForm.type}
                      required
                      onChange={(event) =>
                        setRequestForm((prev) => ({
                          ...prev,
                          type: event.target.value as CityNeedItem["type"],
                        }))
                      }
                    >
                      <option value="housing">Housing</option>
                      <option value="accommodation">Short stay</option>
                      <option value="sports_activity">Activities</option>
                      <option value="city_help">General</option>
                    </select>
                  </label>
                  <label className="cities-redesign__composer-field">
                    <span>City</span>
                    <input
                      className="input cities-redesign__composer-city-readonly"
                      readOnly
                      tabIndex={-1}
                      value={cityLabel(selected.city, selected.country)}
                      aria-readonly="true"
                      aria-describedby="location-request-city-locked-help"
                    />
                    <span id="location-request-city-locked-help" className="visually-hidden">
                      Locked to this city hub. Change city from the hub page to post elsewhere.
                    </span>
                  </label>
                  <label className="cities-redesign__composer-field">
                    <span className="cities-redesign__composer-field-label">
                      <span>Description</span>
                    </span>
                    <div className="cities-redesign__composer-input-wrap">
                      <textarea
                        className="input input--textarea cities-redesign__composer-input cities-redesign__composer-input--textarea"
                        rows={4}
                        value={requestForm.description}
                        maxLength={LOCATION_REQUEST_DESCRIPTION_MAX_CHARS}
                        onChange={(event) => setRequestForm((prev) => ({ ...prev, description: event.target.value }))}
                        placeholder="Add details alumni should know before connecting."
                        required
                        aria-describedby="location-request-desc-counter"
                      />
                      <span
                        id="location-request-desc-counter"
                        className="cities-redesign__composer-char-count cities-redesign__composer-char-count--inside"
                        aria-live="polite"
                      >
                        {requestForm.description.length} / {LOCATION_REQUEST_DESCRIPTION_MAX_CHARS}
                      </span>
                    </div>
                  </label>
                  {composerError ? <p className="cities-redesign__composer-error">{composerError}</p> : null}
                  <div className="cities-redesign__composer-footer">
                    <Button variant="primary" onClick={closeComposer}>
                      Cancel
                    </Button>
                    <Button variant="secondary" type="submit">
                      Post request
                    </Button>
                  </div>
                </form>
              ) : (
                <form className="cities-redesign__composer-form" onSubmit={handleCreateEvent}>
                  <label className="cities-redesign__composer-field">
                    <span>Event title</span>
                    <input
                      className="input"
                      value={eventForm.title}
                      onChange={(event) => setEventForm((prev) => ({ ...prev, title: event.target.value }))}
                      placeholder="e.g. Weekend alumni cricket"
                      required
                    />
                  </label>
                  <label className="cities-redesign__composer-field">
                    <span>City</span>
                    <input
                      className="input cities-redesign__composer-city-readonly"
                      readOnly
                      tabIndex={-1}
                      value={cityLabel(selected.city, selected.country)}
                      aria-readonly="true"
                      aria-describedby="location-event-city-locked-help"
                    />
                    <span id="location-event-city-locked-help" className="visually-hidden">
                      Locked to this city hub. Change city from the hub page to create events elsewhere.
                    </span>
                  </label>
                  <div className="cities-redesign__composer-field-grid">
                    <label className="cities-redesign__composer-field">
                      <span>Date</span>
                      <input
                        type="date"
                        className="input"
                        value={eventForm.date}
                        onChange={(event) => setEventForm((prev) => ({ ...prev, date: event.target.value }))}
                        required
                      />
                    </label>
                    <label className="cities-redesign__composer-field">
                      <span>Time</span>
                      <input
                        type="time"
                        className="input"
                        value={eventForm.time}
                        onChange={(event) => setEventForm((prev) => ({ ...prev, time: event.target.value }))}
                        required
                      />
                    </label>
                  </div>
                  <label className="cities-redesign__composer-field">
                    <span>Venue</span>
                    <input
                      className="input"
                      value={eventForm.venue}
                      onChange={(event) => setEventForm((prev) => ({ ...prev, venue: event.target.value }))}
                      placeholder="e.g. HSR Layout Ground"
                      required
                    />
                  </label>
                  {composerError ? <p className="cities-redesign__composer-error">{composerError}</p> : null}
                  <div className="cities-redesign__composer-footer">
                    <Button variant="primary" onClick={closeComposer}>
                      Cancel
                    </Button>
                    <Button variant="secondary" type="submit">
                      Create event
                    </Button>
                  </div>
                </form>
              )}
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
