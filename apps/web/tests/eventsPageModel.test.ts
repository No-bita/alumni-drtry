import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVENT_FILTERS,
  filterEvents,
  partitionEventsByTime,
  updateEventRsvp,
  type AlumniEvent,
} from "../src/lib/events";

const FIXED_NOW = "2026-05-01T00:00:00.000Z";

const EVENTS: AlumniEvent[] = [
  {
    id: "one",
    title: "Delhi build session",
    description: "Founders and builders meetup.",
    startsAt: "2026-05-03T10:00:00.000Z",
    endsAt: "2026-05-03T12:00:00.000Z",
    format: "offline",
    city: "Delhi",
    venue: "Habitat",
    hostName: "Build Desk",
    tags: ["Build", "Startups"],
    attendeeCount: 10,
    reminderPolicyText: "Reminder 24h before start",
    calendarUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE",
    rsvpStatus: "not_going",
  },
  {
    id: "two",
    title: "Global mentor call",
    description: "Mentor conversations.",
    startsAt: "2026-06-20T10:00:00.000Z",
    endsAt: "2026-06-20T12:00:00.000Z",
    format: "online",
    city: null,
    venue: "Zoom",
    hostName: "Mentor Circle",
    tags: ["Mentorship"],
    attendeeCount: 25,
    reminderPolicyText: "Reminder 24h before start",
    calendarUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE",
    rsvpStatus: "going",
  },
  {
    id: "three",
    title: "Past policy forum",
    description: "Policy discussion.",
    startsAt: "2026-04-01T10:00:00.000Z",
    endsAt: "2026-04-01T12:00:00.000Z",
    format: "hybrid",
    city: "Mumbai",
    venue: "Nehru Centre",
    hostName: "Impact Team",
    tags: ["Policy"],
    attendeeCount: 8,
    reminderPolicyText: "Reminder 24h before start",
    calendarUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE",
    rsvpStatus: "not_going",
  },
];

describe("events page model", () => {
  it("filters by timeframe and city", () => {
    const filtered = filterEvents(
      EVENTS,
      { ...DEFAULT_EVENT_FILTERS, timeframe: "this_week", city: "Delhi" },
      FIXED_NOW
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("one");
  });

  it("filters by query and tag", () => {
    const filtered = filterEvents(
      EVENTS,
      { ...DEFAULT_EVENT_FILTERS, query: "mentor", tag: "Mentorship" },
      FIXED_NOW
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("two");
  });

  it("partitions events into upcoming and past", () => {
    const { upcoming, past } = partitionEventsByTime(EVENTS, FIXED_NOW);

    expect(upcoming.map((event) => event.id)).toEqual(["one", "two"]);
    expect(past.map((event) => event.id)).toEqual(["three"]);
  });

  it("toggles RSVP and attendee count", () => {
    const afterGoing = updateEventRsvp(EVENTS, "one", "going");
    const one = afterGoing.find((event) => event.id === "one");
    expect(one?.rsvpStatus).toBe("going");
    expect(one?.attendeeCount).toBe(11);

    const afterCancel = updateEventRsvp(afterGoing, "two", "not_going");
    const two = afterCancel.find((event) => event.id === "two");
    expect(two?.rsvpStatus).toBe("not_going");
    expect(two?.attendeeCount).toBe(24);
  });
});
