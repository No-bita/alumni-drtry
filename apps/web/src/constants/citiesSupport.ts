import { PLATFORM_DEMO_AUTHOR_IDS } from "./platformDemoPersonIds";

export type CityEventItem = {
  id: string;
  city: string;
  country: string;
  title: string;
  startsAtLabel: string;
  venue: string;
  /** Shown on the cities hub as “N alumni attending”. */
  attendeeCount: number;
};

export type CityNeedType = "housing" | "accommodation" | "sports_activity" | "city_help";

export type CityNeedItem = {
  id: string;
  city: string;
  country: string;
  type: CityNeedType;
  askedByName: string;
  askedByDepartmentCode: string;
  askedByBatchYear: number;
  /** Creator’s person/profile id (`/profiles/:id`). Required for Messaging + avatar links; mock rows use PLATFORM_DEMO_AUTHOR_IDS after seed. */
  askedByPersonId?: string;
  title: string;
  description: string;
};

export const CITY_EVENTS: CityEventItem[] = [
  {
    id: "blr-weekend-cricket",
    city: "Bengaluru",
    country: "India",
    title: "Weekend alumni cricket",
    startsAtLabel: "Sun · 7:00 AM",
    venue: "HSR Layout Ground",
    attendeeCount: 23,
  },
  {
    id: "blr-founder-meet",
    city: "Bengaluru",
    country: "India",
    title: "Founder roundtable",
    startsAtLabel: "Wed · 7:30 PM",
    venue: "Indiranagar Cowork Hub",
    attendeeCount: 17,
  },
  {
    id: "mum-runners-club",
    city: "Mumbai",
    country: "India",
    title: "Marine Drive runners club",
    startsAtLabel: "Sat · 6:15 AM",
    venue: "Marine Drive",
    attendeeCount: 31,
  },
  {
    id: "delhi-badminton-evening",
    city: "Delhi",
    country: "India",
    title: "After-work badminton",
    startsAtLabel: "Thu · 8:00 PM",
    venue: "Saket Sports Complex",
    attendeeCount: 12,
  },
];

/** Static hub posts aligned with seeded platform demo alumni (`PLATFORM_DEMO_AUTHOR_IDS`). */
export const CITY_NEEDS: CityNeedItem[] = [
  {
    id: "need-blr-flatmate-1",
    city: "Bengaluru",
    country: "India",
    type: "housing",
    askedByName: "Rahul Sharma",
    askedByDepartmentCode: "CSE",
    askedByBatchYear: 2021,
    askedByPersonId: PLATFORM_DEMO_AUTHOR_IDS[0],
    title: "Looking for flatmate near Koramangala",
    description: "Moving in next month. Need one roommate for a 2BHK, budget split around 28k each.",
  },
  {
    id: "need-blr-shortstay-1",
    city: "Bengaluru",
    country: "India",
    type: "accommodation",
    askedByName: "Sneha Gupta",
    askedByDepartmentCode: "CSE",
    askedByBatchYear: 2020,
    askedByPersonId: PLATFORM_DEMO_AUTHOR_IDS[1],
    title: "Need short stay for two weeks",
    description: "Visiting for onboarding. Seeking safe furnished stay near ORR.",
  },
  {
    id: "need-blr-football-1",
    city: "Bengaluru",
    country: "India",
    type: "sports_activity",
    askedByName: "Arjun Singh",
    askedByDepartmentCode: "CSE",
    askedByBatchYear: 2022,
    askedByPersonId: PLATFORM_DEMO_AUTHOR_IDS[2],
    title: "Football group for Sunday mornings",
    description: "Looking to join a regular 6v6 game. Beginner-friendly preferred.",
  },
  {
    id: "need-blr-neighborhood-1",
    city: "Bengaluru",
    country: "India",
    type: "city_help",
    askedByName: "Vivek Tiwari",
    askedByDepartmentCode: "ECE",
    askedByBatchYear: 2021,
    askedByPersonId: PLATFORM_DEMO_AUTHOR_IDS[3],
    title: "Advice on neighborhood for first move",
    description: "Office in Embassy Tech Village. Looking for commute-friendly and safe locality tips.",
  },
  {
    id: "need-blr-rental-1",
    city: "Bengaluru",
    country: "India",
    type: "housing",
    askedByName: "Ananya Das",
    askedByDepartmentCode: "CSE",
    askedByBatchYear: 2019,
    askedByPersonId: PLATFORM_DEMO_AUTHOR_IDS[4],
    title: "Seeking rental near Indiranagar",
    description: "Looking for a 1RK/1BHK with decent metro access and quiet locality.",
  },
];

export function matchCityItem(item: { city: string; country: string }, city: string | null, country: string | null): boolean {
  if (!city || !country) return false;
  return item.city.toLowerCase() === city.toLowerCase() && item.country.toLowerCase() === country.toLowerCase();
}
