import { useMemo, useState } from "react";
import { Nav } from "../components/Nav";
import { useAuth } from "../contexts/AuthContext";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";
import {
  DEFAULT_EVENT_FILTERS,
  filterEvents,
  partitionEventsByTime,
  updateEventRsvp,
  type AlumniEvent,
  type EventFiltersState,
} from "../lib/events";
import { EventCard } from "../components/events/EventCard";
import { EventDetailPanel } from "../components/events/EventDetailPanel";
import { EventFilters } from "../components/events/EventFilters";

function navAvatarName(
  profile: { fullName?: string | null } | undefined,
  email: string | undefined
): string {
  const fullName = profile?.fullName?.trim();
  if (fullName) {
    const parts = fullName.split(/\s+/);
    return parts[0] ?? fullName;
  }
  return displayFirstNameFromEmail(email);
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatShortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function EventsPage() {
  const auth = useAuth();
  const [filters, setFilters] = useState<EventFiltersState>(DEFAULT_EVENT_FILTERS);
  const [events, setEvents] = useState<AlumniEvent[]>(() => SAMPLE_EVENTS);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const displayName =
    auth.status === "authenticated"
      ? auth.myProfile?.fullName?.trim() ||
        navAvatarName(auth.myProfile ?? undefined, auth.person.institutionalEmail)
      : "";

  const cities = useMemo(
    () =>
      Array.from(
        new Set(events.map((event) => event.city ?? "Online"))
      ).sort((a, b) => a.localeCompare(b)),
    [events]
  );

  const tags = useMemo(
    () =>
      Array.from(
        new Set(
          events.flatMap((event) => event.tags)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [events]
  );

  const visibleEvents = useMemo(() => filterEvents(events, filters), [events, filters]);
  const { upcoming, past } = useMemo(() => partitionEventsByTime(visibleEvents), [visibleEvents]);
  const rsvpdEvents = useMemo(() => upcoming.filter((event) => event.rsvpStatus === "going"), [upcoming]);

  const selectedEvent = useMemo(
    () => (selectedEventId ? events.find((event) => event.id === selectedEventId) ?? null : null),
    [events, selectedEventId]
  );

  const toggleRsvp = (eventId: string) => {
    setEvents((current) => updateEventRsvp(current, eventId, nextStatus(current, eventId)));
  };

  return (
    <div className="intent-page-shell events-page-shell">
      <Nav variant="home" avatarName={displayName} />
      <div className="events-page">
        <header className="events-page__header">
          <p className="eyebrow events-page__eyebrow">Events</p>
          <h1 className="events-page__title">Find alumni events and RSVP in seconds</h1>
          <p className="events-page__lede body-text">
            Browse sessions by city, format, and interest. RSVP now and receive reminders so you never miss a
            meaningful alumni conversation.
          </p>
        </header>
        <EventFilters value={filters} cities={cities} tags={tags} onChange={setFilters} />
        <div className="events-page__content">
          <section className="events-page__feed" aria-labelledby="events-upcoming-heading">
            <div className="events-page__section-header">
              <h2 id="events-upcoming-heading" className="events-page__section-title">
                Upcoming events
              </h2>
              <span className="events-page__count" aria-label={`${upcoming.length} upcoming events`}>
                {upcoming.length} upcoming
              </span>
            </div>
            {upcoming.length === 0 ? (
              <div className="events-page__empty">
                <p className="events-page__empty-title">
                  {visibleEvents.length === 0 ? "No events match these filters." : "No upcoming events yet."}
                </p>
                <p className="events-page__empty-copy">
                  {visibleEvents.length === 0
                    ? "Try widening your timeframe or clearing city and interest."
                    : "Check past events or RSVP alerts in the right panel."}
                </p>
              </div>
            ) : (
              <div className="events-page__grid" role="list">
                {upcoming.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onOpenDetails={(nextEvent) => setSelectedEventId(nextEvent.id)}
                    onToggleRsvp={toggleRsvp}
                  />
                ))}
              </div>
            )}
          </section>
          <aside className="events-page__side">
            <section className="events-page__rsvpd" aria-labelledby="events-rsvpd-heading">
              <h2 id="events-rsvpd-heading" className="events-page__section-title">
                RSVP’d by you
              </h2>
              {rsvpdEvents.length === 0 ? (
                <p className="events-page__side-empty">RSVP to at least one event to see it here.</p>
              ) : (
                <ul className="events-page__rsvpd-list">
                  {rsvpdEvents.map((event) => (
                    <li key={event.id}>
                      <button
                        type="button"
                        className="events-page__rsvpd-item"
                        onClick={() => setSelectedEventId(event.id)}
                      >
                        <span className="events-page__rsvpd-main">
                          <strong>{event.title}</strong>
                          <small>
                            {formatShortDate(event.startsAt)} · {formatShortTime(event.startsAt)}
                          </small>
                          <small>{event.reminderPolicyText}</small>
                        </span>
                        <span className="events-page__rsvpd-open">Open</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="events-page__past" aria-labelledby="events-past-heading">
              <h2 id="events-past-heading" className="events-page__section-title">
                Past events
              </h2>
              <p className="events-page__past-copy">
                {past.length === 0 ? "No past events in this filter set." : `${past.length} past events.`}
              </p>
            </section>
          </aside>
        </div>
        <EventDetailPanel event={selectedEvent} onClose={() => setSelectedEventId(null)} onToggleRsvp={toggleRsvp} />
      </div>
    </div>
  );
}

function nextStatus(events: AlumniEvent[], eventId: string): AlumniEvent["rsvpStatus"] {
  const current = events.find((event) => event.id === eventId);
  if (!current) return "not_going";
  return current.rsvpStatus === "going" ? "not_going" : "going";
}

const SAMPLE_EVENTS: AlumniEvent[] = [
  {
    id: "evt-delhi-career-night",
    title: "Delhi alumni career night",
    description: "Short talks and fast networking with alumni hiring across product, consulting, and data roles.",
    startsAt: "2026-05-04T13:30:00.000Z",
    endsAt: "2026-05-04T16:00:00.000Z",
    format: "offline",
    city: "Delhi",
    venue: "India Habitat Centre",
    hostName: "Career Cell",
    tags: ["Career", "Networking", "Hiring"],
    attendeeCount: 86,
    reminderPolicyText: "Reminder 24h and 1h before start",
    calendarUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE",
    rsvpStatus: "not_going",
  },
  {
    id: "evt-bengaluru-build-sprint",
    title: "Bengaluru build sprint",
    description: "Find collaborators for side projects and alumni startup ideas in a structured sprint format.",
    startsAt: "2026-05-08T11:00:00.000Z",
    endsAt: "2026-05-08T14:00:00.000Z",
    format: "hybrid",
    city: "Bengaluru",
    venue: "91Springboard + livestream",
    hostName: "Build Network",
    tags: ["Build", "Startups", "Collaboration"],
    attendeeCount: 54,
    reminderPolicyText: "Reminder 24h before start",
    calendarUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE",
    rsvpStatus: "going",
  },
  {
    id: "evt-global-mentor-open-hours",
    title: "Global mentor open hours",
    description: "Drop in to speak with alumni mentors across geographies about transitions and career decisions.",
    startsAt: "2026-05-14T15:00:00.000Z",
    endsAt: "2026-05-14T16:30:00.000Z",
    format: "online",
    city: null,
    venue: "Zoom",
    hostName: "Mentorship Circle",
    tags: ["Mentorship", "Career", "Global"],
    attendeeCount: 122,
    reminderPolicyText: "Reminder 24h and 15m before start",
    calendarUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE",
    rsvpStatus: "not_going",
  },
  {
    id: "evt-mumbai-policy-forum",
    title: "Mumbai policy and impact forum",
    description: "Alumni in policy, governance, and social impact share practical pathways for meaningful work.",
    startsAt: "2026-04-10T12:00:00.000Z",
    endsAt: "2026-04-10T14:00:00.000Z",
    format: "offline",
    city: "Mumbai",
    venue: "Nehru Centre",
    hostName: "Public Impact Desk",
    tags: ["Policy", "Impact", "Community"],
    attendeeCount: 73,
    reminderPolicyText: "Reminder 24h before start",
    calendarUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE",
    rsvpStatus: "not_going",
  },
];
