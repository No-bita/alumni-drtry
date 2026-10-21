/**
 * No-login fixture demo ("look-around mode").
 *
 * `VITE_ENABLE_DEMO_MODE` gates the /demo route (always on in dev). When a visitor opens
 * /demo, a tab-scoped session flag is set and every API call from the web app is answered
 * from the synthetic fixtures below instead of the network (see the branch at the top of
 * `request()` in api/client.ts). No real alumni data is involved and nothing is written
 * anywhere. `/v1/auth/*` (except logout) always passes through to the real API, so a real
 * login is never intercepted; visiting /login or leaving the demo clears the flag.
 *
 * Removal: drop the env flag, the /demo route, FixtureDemoEntry, this file, and the
 * interception branch in api/client.ts.
 */

import type {
  MePerson,
  MyProfileView,
  OccupationView,
  ProfileLinkView,
  PublicProfileView,
  SearchProfileView,
  SearchResult,
} from "../api/client";
import { DEMO_BLOCKED_MESSAGE } from "./demoMode";

/** Build-time gate for the /demo route (mirrors lib/devHubPages.ts). */
export const isFixtureDemoPageEnabled =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_MODE === "true";

const STORAGE_KEY = "alma:fixture-demo:v1";

/** Tab-scoped (sessionStorage): survives a reload mid-demo, never persists beyond the tab. */
export function isFixtureDemoSessionActive(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      window.sessionStorage.getItem(STORAGE_KEY) === "active"
    );
  } catch {
    return false;
  }
}

export function activateFixtureDemoSession(): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, "active");
  } catch {
    /* private mode: the demo still works until the next reload */
  }
}

export function deactivateFixtureDemoSession(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export const FIXTURE_DEMO_PERSON: MePerson = {
  personId: "demo-fixture-person",
  institutionalEmail: "demo.guest@fixture.invalid",
  role: "alumni",
  departmentCode: "CSE",
  departmentName: "Computer Science and Engineering",
  joiningYear: 2019,
  isDemo: true,
};

export const FIXTURE_DEMO_PROFILE: MyProfileView = {
  id: "demo-fixture-profile",
  fullName: "Demo Guest",
  institutionalEmail: "demo.guest@fixture.invalid",
  departmentCode: "CSE",
  departmentName: "Computer Science and Engineering",
  parsedDepartmentCode: "CSE",
  parsedDepartmentName: "Computer Science and Engineering",
  batchYear: 2023,
  parsedJoiningYear: 2019,
  degreeCode: "btech",
  degreeName: "B.Tech",
  bio: "A stand-in profile for looking around. Every alum you see here is made up.",
  residenceCountry: "India",
  residenceCity: "Bengaluru",
  profileCompletedAt: "2026-01-01T00:00:00.000Z",
  onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  appLoginCount: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  role: "alumni",
};

/** One synthetic alum: directory card + full profile share a record. */
type FixtureAlum = {
  card: SearchProfileView;
  profile: PublicProfileView;
  occupations: OccupationView[];
  links: ProfileLinkView[];
};

function alum(
  id: string,
  fullName: string,
  departmentCode: string,
  departmentName: string,
  batchYear: number,
  degreeCode: string,
  degreeName: string,
  city: string,
  country: string,
  roleTitle: string,
  organizationName: string,
  bio: string,
  extraOccupations: OccupationView[] = []
): FixtureAlum {
  const occupation: OccupationView = {
    id: `${id}-occ-1`,
    occupationTypeCode: "job",
    occupationTypeName: "Job",
    organizationId: null,
    organizationName,
    roleTitle,
    description: null,
    startDate: null,
    endDate: null,
    isCurrent: true,
  };
  return {
    card: {
      id,
      fullName,
      departmentCode,
      departmentName,
      parsedDepartmentCode: departmentCode,
      parsedDepartmentName: departmentName,
      batchYear,
      parsedJoiningYear: batchYear - 4,
      degreeCode,
      degreeName,
      bio,
      headlineRoleTitle: roleTitle,
      headlineOrganizationName: organizationName,
      residenceCountry: country,
      residenceCity: city,
      matchReasons: [],
    },
    profile: {
      id,
      fullName,
      departmentCode,
      departmentName,
      degreeCode,
      degreeName,
      batchYear,
      parsedJoiningYear: batchYear - 4,
      bio,
      residenceCountry: country,
      residenceCity: city,
      openToPreferences: null,
    },
    occupations: [occupation, ...extraOccupations],
    links: [],
  };
}

/** All synthetic. No real alumni, no real contact details. */
export const FIXTURE_DEMO_ALUMNI: readonly FixtureAlum[] = [
  alum(
    "demo-aarav-khandelwal",
    "Aarav Khandelwal",
    "CSE",
    "Computer Science and Engineering",
    2023,
    "btech",
    "B.Tech",
    "Bengaluru",
    "India",
    "Product Manager",
    "Zylo Labs",
    "Builds booking tools for clinics. Happy to talk product trade-offs, Bangalore housing, or where to find a decent filter coffee near HSR.",
    [
      {
        id: "demo-aarav-khandelwal-occ-2",
        occupationTypeCode: "internship",
        occupationTypeName: "Internship",
        organizationId: null,
        organizationName: "Paperkite",
        roleTitle: "Product Intern",
        description: null,
        startDate: null,
        endDate: null,
        isCurrent: false,
      },
    ]
  ),
  alum(
    "demo-ishita-baranwal",
    "Ishita Baranwal",
    "ECE",
    "Electronics and Communication Engineering",
    2024,
    "btech",
    "B.Tech",
    "Bengaluru",
    "India",
    "Software Engineer",
    "Nymbleworks",
    "Backend engineer, accidental plant parent. Can help with first-job referrals and switching from core to software."
  ),
  alum(
    "demo-rohan-phadnis",
    "Rohan Phadnis",
    "ME",
    "Mechanical Engineering",
    2022,
    "btech",
    "B.Tech",
    "Bengaluru",
    "India",
    "Co-founder",
    "Tinkershed",
    "Runs a small hardware studio. Looking for a firmware generalist and always up for a makerspace tour."
  ),
  alum(
    "demo-sana-qureshi",
    "Sana Qureshi",
    "CE",
    "Civil Engineering",
    2025,
    "btech",
    "B.Tech",
    "Bengaluru",
    "India",
    "Urban Designer",
    "Studio Meridian",
    "Draws streets for a living. New to the city and collecting bookshop recommendations."
  ),
  alum(
    "demo-vikram-sethi",
    "Vikram Sethi",
    "EE",
    "Electrical Engineering",
    2021,
    "btech",
    "B.Tech",
    "Mumbai",
    "India",
    "Investment Analyst",
    "Capestone Ventures",
    "Reads term sheets by day, reviews street food by night. Happy to chat about breaking into venture."
  ),
  alum(
    "demo-neha-kulkarni",
    "Neha Kulkarni",
    "CHE",
    "Chemical Engineering",
    2023,
    "btech",
    "B.Tech",
    "Mumbai",
    "India",
    "Data Scientist",
    "Rainline Analytics",
    "Turns supply-chain messes into dashboards. Open to mentoring final-year students."
  ),
  alum(
    "demo-arjun-malhotra",
    "Arjun Malhotra",
    "MNC",
    "Mathematics and Computing",
    2026,
    "btech",
    "B.Tech",
    "Pune",
    "India",
    "ML Engineer",
    "Waypoint AI",
    "Trains small models for maps. Ask him about placements, Pune flats, or his very average chess."
  ),
  alum(
    "demo-priya-nair",
    "Priya Nair",
    "MTE",
    "Metallurgical Engineering",
    2020,
    "btech",
    "B.Tech",
    "New Delhi",
    "India",
    "Policy Researcher",
    "North Block Collective",
    "Works on manufacturing policy. Can help with UPSC-adjacent career questions and Delhi renting."
  ),
];

function toSearchResult(cards: SearchProfileView[]): SearchResult {
  return { results: cards, pageInfo: { hasMore: false, nextCursor: null } };
}

function matchesSearch(card: SearchProfileView, params: URLSearchParams): boolean {
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const city = (params.get("residenceCity") ?? "").trim().toLowerCase();
  const country = (params.get("residenceCountry") ?? "").trim().toLowerCase();
  const dept = (params.get("dept") ?? "").trim().toLowerCase();
  const batch = (params.get("batch") ?? "").trim();
  const company = (params.get("company") ?? "").trim().toLowerCase();

  if (city && (card.residenceCity ?? "").toLowerCase() !== city) return false;
  if (country && (card.residenceCountry ?? "").toLowerCase() !== country) return false;
  if (dept && !(card.departmentCode ?? "").toLowerCase().startsWith(dept)) return false;
  if (batch && String(card.batchYear ?? "") !== batch) return false;
  if (company && !(card.headlineOrganizationName ?? "").toLowerCase().includes(company)) return false;
  if (q) {
    const haystack = [
      card.fullName,
      card.departmentName,
      card.departmentCode,
      card.headlineOrganizationName,
      card.headlineRoleTitle,
      card.residenceCity,
      card.bio,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!q.split(/\s+/).every((token) => haystack.includes(token))) return false;
  }
  return true;
}

type FixtureOutcome<T> = {
  data?: T;
  error?: { code: string; message?: string };
  status?: number;
};

/**
 * Answer an API request from fixtures. Returns null only for real-auth endpoints
 * (except logout), which must always reach the real API. Writes get the same
 * 403 DEMO_READ_ONLY shape the server uses, so the existing "Nice try!" UX fires.
 */
export function handleFixtureDemoRequest<T>(
  path: string,
  method: string
): FixtureOutcome<T> | null {
  const [pathname, queryString] = path.split("?", 2);
  const params = new URLSearchParams(queryString ?? "");

  if (pathname === "/v1/auth/logout") {
    deactivateFixtureDemoSession();
    return { data: {} as T };
  }
  if (pathname.startsWith("/v1/auth/")) {
    return null; // real login is never intercepted
  }

  if (method !== "GET") {
    return { status: 403, error: { code: "DEMO_READ_ONLY", message: DEMO_BLOCKED_MESSAGE } };
  }

  if (pathname === "/v1/me") {
    return { data: { person: FIXTURE_DEMO_PERSON } as T };
  }
  if (pathname === "/v1/me/profile") {
    return { data: { profile: FIXTURE_DEMO_PROFILE } as T };
  }
  if (pathname === "/v1/me/links") {
    return { data: { links: [] } as T };
  }
  if (pathname === "/v1/search") {
    const cards = FIXTURE_DEMO_ALUMNI.map((a) => a.card).filter((c) => matchesSearch(c, params));
    return { data: toSearchResult(cards) as T };
  }
  const profileMatch = pathname.match(/^\/v1\/profiles\/([^/]+)$/);
  if (profileMatch) {
    const found = FIXTURE_DEMO_ALUMNI.find((a) => a.profile.id === profileMatch[1]);
    if (!found) {
      return { status: 404, error: { code: "NOT_FOUND", message: "Profile not found." } };
    }
    return {
      data: { profile: found.profile, occupations: found.occupations, links: found.links } as T,
    };
  }
  if (pathname === "/v1/directory/residence-cities") {
    const counts = new Map<string, { city: string; country: string; count: number }>();
    for (const a of FIXTURE_DEMO_ALUMNI) {
      const city = a.card.residenceCity;
      const country = a.card.residenceCountry;
      if (!city || !country) continue;
      const key = `${city}|${country}`;
      const entry = counts.get(key) ?? { city, country, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
    const cities = [...counts.values()].sort((x, y) => y.count - x.count);
    return { data: { cities } as T };
  }
  if (pathname === "/v1/notifications/summary") {
    return { data: { count: 0 } as T };
  }
  if (pathname === "/v1/notifications") {
    return { data: { items: [] } as T };
  }
  if (pathname === "/v1/connection-threads") {
    return { data: { threads: [] } as T };
  }
  if (pathname === "/v1/contact-requests/inbox") {
    return { data: { requests: [] } as T };
  }
  if (pathname === "/v1/campus-monthly/current") {
    return { data: { issue: null } as T };
  }

  /* Outside the four tour screens: a plain miss, not a blocked-action notice. */
  return {
    status: 404,
    error: { code: "DEMO_FIXTURE_MISSING", message: "That part isn't part of the demo." },
  };
}
