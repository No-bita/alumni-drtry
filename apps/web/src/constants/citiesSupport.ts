export type CityEventItem = {
  id: string;
  city: string;
  country: string;
  title: string;
  startsAtLabel: string;
  venue: string;
  attendeesLabel: string;
};

export type CityNeedType = "housing" | "accommodation" | "sports_activity" | "city_help";

export type CityNeedItem = {
  id: string;
  city: string;
  country: string;
  type: CityNeedType;
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
    attendeesLabel: "23 attending",
  },
  {
    id: "blr-founder-meet",
    city: "Bengaluru",
    country: "India",
    title: "Founder roundtable",
    startsAtLabel: "Wed · 7:30 PM",
    venue: "Indiranagar Cowork Hub",
    attendeesLabel: "17 attending",
  },
  {
    id: "mum-runners-club",
    city: "Mumbai",
    country: "India",
    title: "Marine Drive runners club",
    startsAtLabel: "Sat · 6:15 AM",
    venue: "Marine Drive",
    attendeesLabel: "31 attending",
  },
  {
    id: "delhi-badminton-evening",
    city: "Delhi",
    country: "India",
    title: "After-work badminton",
    startsAtLabel: "Thu · 8:00 PM",
    venue: "Saket Sports Complex",
    attendeesLabel: "12 attending",
  },
];

export const CITY_NEEDS: CityNeedItem[] = [
  {
    id: "need-blr-flatmate-1",
    city: "Bengaluru",
    country: "India",
    type: "housing",
    title: "Looking for flatmate near Koramangala",
    description: "Moving in next month. Need one roommate for a 2BHK, budget split around 28k each.",
  },
  {
    id: "need-blr-shortstay-1",
    city: "Bengaluru",
    country: "India",
    type: "accommodation",
    title: "Need short stay for two weeks",
    description: "Visiting for onboarding. Seeking safe furnished stay near ORR.",
  },
  {
    id: "need-blr-football-1",
    city: "Bengaluru",
    country: "India",
    type: "sports_activity",
    title: "Football group for Sunday mornings",
    description: "Looking to join a regular 6v6 game. Beginner-friendly preferred.",
  },
  {
    id: "need-mum-neighborhood-1",
    city: "Mumbai",
    country: "India",
    type: "city_help",
    title: "Advice on neighborhood for first move",
    description: "Office in Lower Parel. Need commute-friendly and safe recommendations.",
  },
  {
    id: "need-delhi-rental-1",
    city: "Delhi",
    country: "India",
    type: "housing",
    title: "Seeking rental near IIT Delhi side",
    description: "Looking for a 1RK/1BHK with decent metro access and quiet locality.",
  },
];

export function matchCityItem(item: { city: string; country: string }, city: string | null, country: string | null): boolean {
  if (!city || !country) return false;
  return item.city.toLowerCase() === city.toLowerCase() && item.country.toLowerCase() === country.toLowerCase();
}
