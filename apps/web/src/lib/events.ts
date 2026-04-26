export type EventFormat = "online" | "offline" | "hybrid";
export type EventRsvpStatus = "not_going" | "going";
export type EventTimeframe = "all" | "this_week" | "this_month";

export type AlumniEvent = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  format: EventFormat;
  city: string | null;
  venue: string;
  hostName: string;
  tags: string[];
  attendeeCount: number;
  reminderPolicyText: string;
  calendarUrl: string;
  rsvpStatus: EventRsvpStatus;
};

export type EventFiltersState = {
  timeframe: EventTimeframe;
  format: "all" | EventFormat;
  city: string;
  tag: string;
  query: string;
};

export const DEFAULT_EVENT_FILTERS: EventFiltersState = {
  timeframe: "all",
  format: "all",
  city: "all",
  tag: "all",
  query: "",
};

function dateDiffInDays(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

function inTimeframe(startsAtIso: string, timeframe: EventTimeframe, nowIso: string): boolean {
  if (timeframe === "all") return true;
  const days = dateDiffInDays(nowIso, startsAtIso);
  if (days < 0) return false;
  if (timeframe === "this_week") return days <= 7;
  return days <= 31;
}

export function filterEvents(
  events: AlumniEvent[],
  filters: EventFiltersState,
  nowIso: string = new Date().toISOString()
): AlumniEvent[] {
  const q = filters.query.trim().toLowerCase();
  return events
    .filter((event) => inTimeframe(event.startsAt, filters.timeframe, nowIso))
    .filter((event) => (filters.format === "all" ? true : event.format === filters.format))
    .filter((event) => (filters.city === "all" ? true : (event.city ?? "Online") === filters.city))
    .filter((event) =>
      filters.tag === "all" ? true : event.tags.some((tag) => tag.toLowerCase() === filters.tag.toLowerCase())
    )
    .filter((event) => {
      if (!q) return true;
      return (
        event.title.toLowerCase().includes(q) ||
        event.description.toLowerCase().includes(q) ||
        event.hostName.toLowerCase().includes(q) ||
        event.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export function partitionEventsByTime(events: AlumniEvent[], nowIso: string = new Date().toISOString()): {
  upcoming: AlumniEvent[];
  past: AlumniEvent[];
} {
  const now = Date.parse(nowIso);
  const upcoming: AlumniEvent[] = [];
  const past: AlumniEvent[] = [];
  events.forEach((event) => {
    if (Date.parse(event.endsAt) < now) {
      past.push(event);
      return;
    }
    upcoming.push(event);
  });
  return { upcoming, past };
}

export function updateEventRsvp(
  events: AlumniEvent[],
  eventId: string,
  nextStatus: EventRsvpStatus
): AlumniEvent[] {
  return events.map((event) =>
    event.id === eventId
      ? {
          ...event,
          rsvpStatus: nextStatus,
          attendeeCount:
            nextStatus === "going"
              ? event.rsvpStatus === "going"
                ? event.attendeeCount
                : event.attendeeCount + 1
              : event.rsvpStatus === "going"
                ? Math.max(0, event.attendeeCount - 1)
                : event.attendeeCount,
        }
      : event
  );
}
