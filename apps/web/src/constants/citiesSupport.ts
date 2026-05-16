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
  /** Creator’s person/profile id (`/profiles/:id`) when the post is backed by a real alumni row. */
  askedByPersonId?: string;
  title: string;
  description: string;
};

const DEV_CITY_EVENTS: CityEventItem[] = [
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

/** Local-only sample posts for layout QA; never shipped in production builds. */
const DEV_CITY_NEEDS: CityNeedItem[] = [
  {
    id: "need-blr-flatmate-1",
    city: "Bengaluru",
    country: "India",
    type: "housing",
    askedByName: "Sample alumni",
    askedByDepartmentCode: "CSE",
    askedByBatchYear: 2021,
    title: "Looking for flatmate near Koramangala",
    description: "Moving in next month. Need one roommate for a 2BHK, budget split around 28k each.",
  },
  {
    id: "need-blr-shortstay-1",
    city: "Bengaluru",
    country: "India",
    type: "accommodation",
    askedByName: "Sample alumni",
    askedByDepartmentCode: "CSE",
    askedByBatchYear: 2020,
    title: "Need short stay for two weeks",
    description: "Visiting for onboarding. Seeking safe furnished stay near ORR.",
  },
];

/** Production: user-created hub posts only (`LocationPage` local state). Dev: includes sample rows above. */
export const CITY_EVENTS: CityEventItem[] = import.meta.env.DEV ? DEV_CITY_EVENTS : [];

export const CITY_NEEDS: CityNeedItem[] = import.meta.env.DEV ? DEV_CITY_NEEDS : [];

export function matchCityItem(item: { city: string; country: string }, city: string | null, country: string | null): boolean {
  if (!city || !country) return false;
  return item.city.toLowerCase() === city.toLowerCase() && item.country.toLowerCase() === country.toLowerCase();
}
