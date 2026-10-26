import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Nav } from "../components/Nav";
import { Button } from "../components/Button";
import { useAuth } from "../contexts/AuthContext";
import {
  type IntentcastFeedItem,
  type IntentcastFeedResponse,
  type MyProfileView,
  type ReceivedBulletinRepliesFeedResponse,
  type SearchResult,
} from "../api/client";
import { assertApiGet } from "../lib/assertApiGet";
import { queryKeys } from "../lib/queryKeys";
import { displayFirstNameFromEmail } from "../lib/emailDisplayName";
import {
  HomeOpportunityRail,
  type HomeOpportunityCategory,
  type HomeOpportunityItem,
} from "../components/HomeOpportunityRail";
import { encodeBulletinContentWithUiCategory, type BulletinUiCategory } from "../lib/bulletinPostCardUtils";
import { normalizeOpportunityCard } from "../lib/intentcastOpportunityCard";
import { normalizeHomeOpportunityCategory } from "../lib/homeOpportunityCategory";
import { HomeIntentHero } from "../components/HomeIntentHero";
import { HomeAnswerKeyCard } from "../components/HomeAnswerKeyCard";
import { HomeFootprintStrip } from "../components/HomeFootprintStrip";
import { PostBulletinFlow, type PostBulletinFlowHandle } from "../components/PostBulletinFlow";
import { HomeNetworkPanel } from "../components/HomeNetworkPanel";
import { HomeFeedbackSection } from "../components/HomeFeedbackSection";
import { HomeBrowseRow } from "../components/HomeBrowseRow";
import { HomeSentNotesLine } from "../components/HomeSentNotesLine";
import { OnboardingChecklistCard } from "../components/OnboardingChecklistCard";
import "../styles/home-layout.css";

const EMPTY_POSTS: IntentcastFeedItem[] = [];

function displayFirstName(profile: MyProfileView, email: string | undefined): string {
  const fn = (profile.fullName ?? "").trim() || profile.fullName?.trim();
  if (fn) {
    const parts = fn.split(/\s+/);
    return parts[0] ?? fn;
  }
  return displayFirstNameFromEmail(email);
}

const HOME_MOCK_OPPORTUNITIES: HomeOpportunityItem[] = [
  {
    id: "mock-op-1",
    personId: "mock-person-1",
    fullName: "Mandeep Singh",
    departmentCode: "MET",
    batchYear: 2025,
    postedRelative: "3d ago",
    title: "Looking for referral at Razorpay (Backend)",
    summary: "2 years experience in backend systems. Open to Bangalore or remote.",
    chips: ["Backend", "Bangalore", "Full-time"],
    category: "referrals",
  },
  {
    id: "mock-op-2",
    personId: "mock-person-2",
    fullName: "Sneha Gupta",
    departmentCode: "CSE",
    batchYear: 2024,
    postedRelative: "1d ago",
    title: "Referral for Product Manager roles",
    summary: "3 years in product management. Looking for PM roles in Bangalore.",
    chips: ["Product", "Bangalore", "Full-time"],
    category: "referrals",
  },
  {
    id: "mock-op-3",
    personId: "mock-person-3",
    fullName: "Rohit Verma",
    departmentCode: "EE",
    batchYear: 2023,
    postedRelative: "5h ago",
    title: "Referral for Data Scientist roles",
    summary: "2.5 years in ML and analytics. Open to Bangalore and Hyderabad.",
    chips: ["Data Science", "ML", "Full-time"],
    category: "hiring",
  },
  {
    id: "mock-op-4",
    personId: "mock-person-4",
    fullName: "Ananya Das",
    departmentCode: "CHE",
    batchYear: 2022,
    postedRelative: "8h ago",
    title: "Moving to Mumbai next month",
    summary: "Looking for locality tips near Lower Parel and trusted rental leads.",
    chips: ["Mumbai", "Relocation", "Housing"],
    category: "moving_cities",
  },
  {
    id: "mock-op-5",
    personId: "mock-person-5",
    fullName: "Priya Kapoor",
    departmentCode: "ECE",
    batchYear: 2024,
    postedRelative: "2d ago",
    title: "Internship referrals at early-stage infra SaaS teams",
    summary:
      "Screened interns last summer — happy to shortlist resumes for infra / backend-heavy roles. Prefer teams with clear mentorship and Bangalore or hybrid.",
    chips: ["Internships", "Backend", "Bangalore"],
    category: "referrals",
  },
  {
    id: "mock-op-6",
    personId: "mock-person-6",
    fullName: "Arjun Mehta",
    departmentCode: "MME",
    batchYear: 2023,
    postedRelative: "just now",
    title: "Offering 30-minute mentorship: ops → founder path",
    summary:
      "Recently closed a Series A logistics startup. Alumni can DM for a sanity check on GTM motions, investor updates, or first manufacturing hires.",
    chips: ["Mentorship", "Founders", "Logistics"],
    category: "referrals",
  },
  {
    id: "mock-op-7",
    personId: "mock-person-7",
    fullName: "Fatima Siddiqui",
    departmentCode: "PIE",
    batchYear: 2025,
    postedRelative: "yesterday",
    title: "Hiring 2 grads — growth analytics (SQL + dashboards)",
    summary:
      "Product-led B2C team in Noida. Looking for IIT BHU folks comfortable with experimentation readouts and funnel instrumentation; pairing with seniors on first projects.",
    chips: ["Full-time", "Noida", "Analytics"],
    category: "hiring",
  },
  {
    id: "mock-op-8",
    personId: "mock-person-8",
    fullName: "Karan Bose",
    departmentCode: "CSE",
    batchYear: 2025,
    postedRelative: "4h ago",
    title: "Referrals open for backend / platform interns (fintech)",
    summary:
      "On the campus committee this cycle. Happy to internally route strong systems folks to two partner teams prioritizing Postgres, queues, and on-call rotations.",
    chips: ["Campus", "Intern", "Bangalore"],
    category: "referrals",
  },
  {
    id: "mock-op-9",
    personId: "mock-person-9",
    fullName: "Meera Jain",
    departmentCode: "EE",
    batchYear: 2023,
    postedRelative: "yesterday",
    title: "L4 backend referrals — payments reconciliation pod",
    summary:
      "We are doubling the reconciliations surface. Looking for IIT BHU alumni with ledgers, retries, and idempotent APIs. Remote-friendly with India payroll.",
    chips: ["L4+", "Payments", "Remote"],
    category: "referrals",
  },
  {
    id: "mock-op-10",
    personId: "mock-person-10",
    fullName: "Neel Chauhan",
    departmentCode: "MET",
    batchYear: 2022,
    postedRelative: "Mon",
    title: "Industrial IoT referrals for hardware + firmware teams",
    summary:
      "Two roles blending plant telemetry and gateway firmware. Comfortable cross-posting resumes to fabs with safety-critical culture and partner OEMs.",
    chips: ["IoT", "Firmware", "Chennai"],
    category: "referrals",
  },
  {
    id: "mock-op-11",
    personId: "mock-person-11",
    fullName: "Sana Rahman",
    departmentCode: "CHE",
    batchYear: 2021,
    postedRelative: "Tue",
    title: "Process engineer referrals — battery materials pilot plant",
    summary:
      "Pilot line scaling electrolyte dosing. Interested in alum with reaction engineering plus vendor qualification experience; hybrid near Pune.",
    chips: ["ChemE", "Pune", "Hybrid"],
    category: "referrals",
  },
  {
    id: "mock-op-12",
    personId: "mock-person-12",
    fullName: "Ritwik Sen",
    departmentCode: "CSE",
    batchYear: 2020,
    postedRelative: "Fri",
    title: "Mock interview slots: ML systems design (4 slots / month)",
    summary:
      "Staff ML at marketplace ads. Offering dry-runs covering feature stores, eval harnesses, and on-call anecdotes. Prefer written problem brief beforehand.",
    chips: ["Mock interview", "ML", "Ads"],
    category: "referrals",
  },
  {
    id: "mock-op-13",
    personId: "mock-person-13",
    fullName: "Dia Khanna",
    departmentCode: "PIE",
    batchYear: 2024,
    postedRelative: "Sat",
    title: "Resume + story workshop for pivots into PM",
    summary:
      "Recently shipped a 0→1 campus product. Hosting 45-minute critiques focused on narratives and metrics—not generic templates—for three folks per month.",
    chips: ["Product", "Workshop"],
    category: "referrals",
  },
  {
    id: "mock-op-14",
    personId: "mock-person-14",
    fullName: "Nikhil Rao",
    departmentCode: "MME",
    batchYear: 2019,
    postedRelative: "Thu",
    title: "Hiring contract TPM — factory digitization rollout",
    summary:
      "Need TPM to sequence MES rollout across two plants. Strong stakeholder wrangling, Hindi/English, travel ~30%. Six-month contract with extension path.",
    chips: ["TPM", "Contract", "Travel"],
    category: "hiring",
  },
  {
    id: "mock-op-15",
    personId: "mock-person-15",
    fullName: "Tara Nambiar",
    departmentCode: "ECE",
    batchYear: 2022,
    postedRelative: "Wed",
    title: "Hiring embedded intern — motor control lab",
    summary:
      "Lab builds dyno rigs for EV drivetrain partners. Looking for someone comfortable with C on MCUs, basic Simulink, and tidy bring-up logs.",
    chips: ["Intern", "Embedded", "Pune"],
    category: "hiring",
  },
  {
    id: "mock-op-16",
    personId: "mock-person-16",
    fullName: "Isha Reddy",
    departmentCode: "ARCH",
    batchYear: 2023,
    postedRelative: "next week",
    title: "Moving to Singapore — housing & commute sanity check",
    summary:
      "Employer near One-North. Seeking honest notes on HDB vs condo tradeoffs, typical deposit timelines, and alumni roommates chats if anyone is nearby.",
    chips: ["Singapore", "Housing", "Relocation"],
    category: "moving_cities",
  },
  {
    id: "mock-op-17",
    personId: "mock-person-17",
    fullName: "Vivek Anand",
    departmentCode: "PHY",
    batchYear: 2026,
    postedRelative: "Today",
    title: "Referrals for quantitative research trainee programs",
    summary:
      "Rotational program blends stochastic modeling plus execution tooling. Keen to uplift folks with olympiad math appetite and disciplined backtesting notebooks.",
    chips: ["Finance", "Research", "Mumbai"],
    category: "referrals",
  },
];

const HOME_MOCK_INTENTCAST_ISO = "2026-05-01T10:00:00.000Z";

function bulletinUiFromHomeMockChip(chip: ReturnType<typeof normalizeHomeOpportunityCategory>): BulletinUiCategory {
  switch (chip) {
    case "hiring":
      return "hiring";
    case "relocation":
      return "relocation";
    case "startups":
      return "startups";
    case "guidance":
      return "guidance";
    case "careers":
      return "careers";
    case "replies":
      return "careers";
    default: {
      const _exhaustive: never = chip;
      return _exhaustive;
    }
  }
}

function homeMockOpportunityToIntentcast(item: (typeof HOME_MOCK_OPPORTUNITIES)[number]): IntentcastFeedItem {
  const chip = normalizeHomeOpportunityCategory(item.category);
  return {
    id: item.id,
    authorPersonId: item.personId,
    authorFullName: item.fullName,
    authorDepartmentCode: item.departmentCode,
    authorDepartmentName: null,
    authorBatchYear: item.batchYear,
    authorCurrentRoleTitle: null,
    authorCurrentOrganizationName: null,
    category: "collaboration",
    content: encodeBulletinContentWithUiCategory(`${item.title}\n\n${item.summary}`, bulletinUiFromHomeMockChip(chip)),
    status: "open",
    expiresAt: HOME_MOCK_INTENTCAST_ISO,
    closedAt: null,
    createdAt: HOME_MOCK_INTENTCAST_ISO,
    editableUntil: HOME_MOCK_INTENTCAST_ISO,
    responseCount: 0,
    viewerHasResponded: false,
  };
}

const HOME_MOCK_NETWORK_MEMBERS: SearchResult["results"] = [
  {
    id: "mock-person-1",
    fullName: "Mandeep Singh",
    departmentCode: "MET",
    departmentName: null,
    parsedDepartmentCode: null,
    parsedDepartmentName: null,
    batchYear: 2025,
    parsedJoiningYear: null,
    degreeCode: "btech",
    degreeName: "B.Tech",
    bio: "Backend engineer building reliability systems.",
    headlineRoleTitle: "Software Engineer",
    headlineOrganizationName: "Razorpay",
    residenceCountry: "India",
    residenceCity: "Bengaluru",
    matchReasons: [],
  },
  {
    id: "mock-person-2",
    fullName: "Sneha Gupta",
    departmentCode: "CSE",
    departmentName: null,
    parsedDepartmentCode: null,
    parsedDepartmentName: null,
    batchYear: 2024,
    parsedJoiningYear: null,
    degreeCode: "btech",
    degreeName: "B.Tech",
    bio: "Product manager focused on B2B workflow tools.",
    headlineRoleTitle: "Product Manager",
    headlineOrganizationName: "Atlassian",
    residenceCountry: "India",
    residenceCity: "Bengaluru",
    matchReasons: [],
  },
  {
    id: "mock-person-3",
    fullName: "Rohit Verma",
    departmentCode: "EE",
    departmentName: null,
    parsedDepartmentCode: null,
    parsedDepartmentName: null,
    batchYear: 2023,
    parsedJoiningYear: null,
    degreeCode: "btech",
    degreeName: "B.Tech",
    bio: "Data scientist building recommendations at scale.",
    headlineRoleTitle: "Data Scientist",
    headlineOrganizationName: "Swiggy",
    residenceCountry: "India",
    residenceCity: "Hyderabad",
    matchReasons: [],
  },
  {
    id: "mock-person-4",
    fullName: "Ananya Das",
    departmentCode: "CHE",
    departmentName: null,
    parsedDepartmentCode: null,
    parsedDepartmentName: null,
    batchYear: 2022,
    parsedJoiningYear: null,
    degreeCode: "btech",
    degreeName: "B.Tech",
    bio: "Consultant helping teams scale operations.",
    headlineRoleTitle: "Consultant",
    headlineOrganizationName: "Bain & Company",
    residenceCountry: "India",
    residenceCity: "Mumbai",
    matchReasons: [],
  },
  {
    id: "mock-person-5",
    fullName: "Priya Kapoor",
    departmentCode: "ECE",
    departmentName: null,
    parsedDepartmentCode: null,
    parsedDepartmentName: null,
    batchYear: 2024,
    parsedJoiningYear: null,
    degreeCode: "btech",
    degreeName: "B.Tech",
    bio: "Backend engineer leaning into distributed systems.",
    headlineRoleTitle: "Software Engineer",
    headlineOrganizationName: "Thoughtspot",
    residenceCountry: "India",
    residenceCity: "Bengaluru",
    matchReasons: [],
  },
  {
    id: "mock-person-6",
    fullName: "Arjun Mehta",
    departmentCode: "MME",
    departmentName: null,
    parsedDepartmentCode: null,
    parsedDepartmentName: null,
    batchYear: 2023,
    parsedJoiningYear: null,
    degreeCode: "btech",
    degreeName: "B.Tech",
    bio: "Founder-operator focused on fulfilment infra.",
    headlineRoleTitle: "Co-founder & COO",
    headlineOrganizationName: "Northline Freight",
    residenceCountry: "India",
    residenceCity: "Gurugram",
    matchReasons: [],
  },
  {
    id: "mock-person-7",
    fullName: "Fatima Siddiqui",
    departmentCode: "PIE",
    departmentName: null,
    parsedDepartmentCode: null,
    parsedDepartmentName: null,
    batchYear: 2025,
    parsedJoiningYear: null,
    degreeCode: "btech",
    degreeName: "B.Tech",
    bio: "Growth analyst shipping experiments weekly.",
    headlineRoleTitle: "Growth Analyst",
    headlineOrganizationName: "NovaCart",
    residenceCountry: "India",
    residenceCity: "Noida",
    matchReasons: [],
  },
  {
    id: "mock-person-8",
    fullName: "Karan Bose",
    departmentCode: "CSE",
    departmentName: null,
    parsedDepartmentCode: null,
    parsedDepartmentName: null,
    batchYear: 2025,
    parsedJoiningYear: null,
    degreeCode: "btech",
    degreeName: "B.Tech",
    bio: "Campus placements volunteer and internship mentor.",
    headlineRoleTitle: "Software Engineer Intern",
    headlineOrganizationName: "Cred",
    residenceCountry: "India",
    residenceCity: "Bengaluru",
    matchReasons: [],
  },
  {
    id: "mock-person-9",
    fullName: "Meera Jain",
    departmentCode: "EE",
    departmentName: null,
    parsedDepartmentCode: null,
    parsedDepartmentName: null,
    batchYear: 2023,
    parsedJoiningYear: null,
    degreeCode: "btech",
    degreeName: "B.Tech",
    bio: "Backend engineer in payments infra.",
    headlineRoleTitle: "Senior Engineer",
    headlineOrganizationName: "Stripe",
    residenceCountry: "India",
    residenceCity: "Bengaluru",
    matchReasons: [],
  },
  {
    id: "mock-person-10",
    fullName: "Neel Chauhan",
    departmentCode: "MET",
    departmentName: null,
    parsedDepartmentCode: null,
    parsedDepartmentName: null,
    batchYear: 2022,
    parsedJoiningYear: null,
    degreeCode: "btech",
    degreeName: "B.Tech",
    bio: "IoT gateways and plant connectivity.",
    headlineRoleTitle: "Staff Engineer",
    headlineOrganizationName: "Forbes Marshall",
    residenceCountry: "India",
    residenceCity: "Chennai",
    matchReasons: [],
  },
  {
    id: "mock-person-11",
    fullName: "Sana Rahman",
    departmentCode: "CHE",
    departmentName: null,
    parsedDepartmentCode: null,
    parsedDepartmentName: null,
    batchYear: 2021,
    parsedJoiningYear: null,
    degreeCode: "btech",
    degreeName: "B.Tech",
    bio: "Scale-up chemist for advanced materials.",
    headlineRoleTitle: "Process Lead",
    headlineOrganizationName: "Log9 Materials",
    residenceCountry: "India",
    residenceCity: "Pune",
    matchReasons: [],
  },
  {
    id: "mock-person-12",
    fullName: "Ritwik Sen",
    departmentCode: "CSE",
    departmentName: null,
    parsedDepartmentCode: null,
    parsedDepartmentName: null,
    batchYear: 2020,
    parsedJoiningYear: null,
    degreeCode: "btech",
    degreeName: "B.Tech",
    bio: "Ads ML systems and ranking.",
    headlineRoleTitle: "Staff ML Engineer",
    headlineOrganizationName: "Meta",
    residenceCountry: "India",
    residenceCity: "Bengaluru",
    matchReasons: [],
  },
  {
    id: "mock-person-13",
    fullName: "Dia Khanna",
    departmentCode: "PIE",
    departmentName: null,
    parsedDepartmentCode: null,
    parsedDepartmentName: null,
    batchYear: 2024,
    parsedJoiningYear: null,
    degreeCode: "btech",
    degreeName: "B.Tech",
    bio: "PM for student-facing workflows.",
    headlineRoleTitle: "Product Manager",
    headlineOrganizationName: "LeapScholar",
    residenceCountry: "India",
    residenceCity: "Gurugram",
    matchReasons: [],
  },
  {
    id: "mock-person-14",
    fullName: "Nikhil Rao",
    departmentCode: "MME",
    departmentName: null,
    parsedDepartmentCode: null,
    parsedDepartmentName: null,
    batchYear: 2019,
    parsedJoiningYear: null,
    degreeCode: "btech",
    degreeName: "B.Tech",
    bio: "Digitization PM across metal processing units.",
    headlineRoleTitle: "Technical Program Manager",
    headlineOrganizationName: "ArcelorIndia",
    residenceCountry: "India",
    residenceCity: "Jamshedpur",
    matchReasons: [],
  },
  {
    id: "mock-person-15",
    fullName: "Tara Nambiar",
    departmentCode: "ECE",
    departmentName: null,
    parsedDepartmentCode: null,
    parsedDepartmentName: null,
    batchYear: 2022,
    parsedJoiningYear: null,
    degreeCode: "btech",
    degreeName: "B.Tech",
    bio: "Embedded systems for traction labs.",
    headlineRoleTitle: "Hardware Engineer II",
    headlineOrganizationName: "Ola Electric",
    residenceCountry: "India",
    residenceCity: "Pune",
    matchReasons: [],
  },
  {
    id: "mock-person-16",
    fullName: "Isha Reddy",
    departmentCode: "ARCH",
    departmentName: null,
    parsedDepartmentCode: null,
    parsedDepartmentName: null,
    batchYear: 2023,
    parsedJoiningYear: null,
    degreeCode: "btech",
    degreeName: "B.Tech",
    bio: "Designer relocating for research studio work.",
    headlineRoleTitle: "Architectural Designer",
    headlineOrganizationName: "WOHA",
    residenceCountry: "Singapore",
    residenceCity: "Singapore",
    matchReasons: [],
  },
  {
    id: "mock-person-17",
    fullName: "Vivek Anand",
    departmentCode: "PHY",
    departmentName: null,
    parsedDepartmentCode: null,
    parsedDepartmentName: null,
    batchYear: 2026,
    parsedJoiningYear: null,
    degreeCode: "btech",
    degreeName: "B.Tech",
    bio: "Quantitative research intern pipeline.",
    headlineRoleTitle: "Research Associate",
    headlineOrganizationName: "Nomura",
    residenceCountry: "India",
    residenceCity: "Mumbai",
    matchReasons: [],
  },
];

/**
 * Signed-in home (`/home`): hero, batch snapshot, bulletin.
 * Route is protected by RequireAuth + RequireProfileComplete.
 */
export function Home() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const bulletinFlowRef = useRef<PostBulletinFlowHandle>(null);
  const authPersonId = auth.status === "authenticated" ? auth.person.personId : undefined;
  const profile = auth.status === "authenticated" ? auth.myProfile : null;
  const [activeCategory, setActiveCategory] = useState<HomeOpportunityCategory>("all");
  const useDevMocks =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mockHome") === "1";
  const authenticated = auth.status === "authenticated";
  const profileBatchYear = profile?.batchYear ?? null;
  const profileDeptLower = (() => {
    const dc = profile?.departmentCode;
    return dc ? dc.toLowerCase() : "";
  })();
  const batchSnapshotEnabled = Boolean(
    authenticated && authPersonId && profileBatchYear != null && profileDeptLower
  );

  const batchQuery = useQuery({
    queryKey: queryKeys.home.batchSnapshot(authPersonId ?? "", profileBatchYear ?? 0, profileDeptLower),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        batch: String(profileBatchYear),
        dept: profileDeptLower,
        limit: "100",
      });
      return assertApiGet<SearchResult>(`/v1/search?${params.toString()}`, signal);
    },
    enabled: batchSnapshotEnabled,
  });
  const opportunitiesQuery = useQuery({
    queryKey: ["home", "opportunity-rail"],
    queryFn: ({ signal }) =>
      assertApiGet<IntentcastFeedResponse>(
        "/v1/intentcasts?limit=48&offset=0&excludeAuthorSoftDeleted=true",
        signal
      ),
    enabled: authenticated,
  });

  const bulletinRepliesQuery = useQuery({
    queryKey: queryKeys.home.receivedBulletinReplies(),
    queryFn: ({ signal }) =>
      assertApiGet<ReceivedBulletinRepliesFeedResponse>(
        "/v1/intentcasts/me/received-responses?limit=48&offset=0",
        signal
      ),
    enabled: authenticated,
  });

  const myPostsQuery = useQuery({
    queryKey: queryKeys.home.myPosts(),
    queryFn: ({ signal }) =>
      assertApiGet<IntentcastFeedResponse>(
        "/v1/intentcasts?mine=true&limit=20&offset=0&excludeAuthorSoftDeleted=true",
        signal
      ),
    enabled: authenticated && !useDevMocks,
  });

  const opportunitiesFeedLoading =
    authenticated &&
    !useDevMocks &&
    (opportunitiesQuery.isPending ||
      (opportunitiesQuery.isFetching && (opportunitiesQuery.data?.intentcasts.length ?? 0) === 0));

  const bulletinRepliesFeedLoading =
    authenticated &&
    (bulletinRepliesQuery.isPending ||
      (bulletinRepliesQuery.isFetching && bulletinRepliesQuery.data === undefined));

  const batchMeta = useMemo(() => {
    if (!batchQuery.data || !authPersonId) return null;
    const others = batchQuery.data.results.filter((row) => row.id !== authPersonId);
    const hasMore = batchQuery.data.pageInfo.hasMore;
    const countLabel =
      others.length === 0
        ? "0"
        : hasMore && others.length >= 100
          ? "100+"
          : hasMore
            ? `${others.length}+`
            : String(others.length);
    return {
      countLabel,
      members: others,
      empty: others.length === 0,
    };
  }, [batchQuery.data, authPersonId]);
  const batchDirectorySearchHref = "/search";
  const opportunityIntentcasts = useMemo(() => {
    if (useDevMocks) return HOME_MOCK_OPPORTUNITIES.map(homeMockOpportunityToIntentcast);
    return opportunitiesQuery.data?.intentcasts ?? [];
  }, [opportunitiesQuery.data, useDevMocks]);
  const viewModel = useMemo(() => {
    const totalCountFor = (category: Exclude<HomeOpportunityCategory, "all">) =>
      opportunityIntentcasts.filter((ic) => normalizeOpportunityCard(ic.content, ic.category).category === category)
        .length;

    return {
      activeCategory,
      categoryCounts: {
        careers: totalCountFor("careers"),
        hiring: totalCountFor("hiring"),
        relocation: totalCountFor("relocation"),
        startups: totalCountFor("startups"),
        guidance: totalCountFor("guidance"),
        replies: bulletinRepliesQuery.data?.totalCount ?? 0,
      },
    };
  }, [activeCategory, opportunityIntentcasts, bulletinRepliesQuery.data?.totalCount]);
  if (!profile) {
    return (
      <>
        <Nav variant="home" />
        <div style={{ padding: "4rem var(--page-x)", textAlign: "center", maxWidth: 420, margin: "0 auto" }}>
          <p className="section-headline" style={{ marginBottom: 12 }}>
            Couldn’t load your profile
          </p>
          <p className="body-text" style={{ color: "var(--ink-muted)", marginBottom: 24 }}>
            Refresh the page or try signing in again.
          </p>
          <Link to="/login">
            <Button variant="primary">Sign in</Button>
          </Link>
        </div>
      </>
    );
  }

  const firstName = displayFirstName(
    profile,
    auth.status === "authenticated" ? auth.person.institutionalEmail : undefined
  );
  const displayName = (profile.fullName ?? "").trim() || profile.fullName?.trim() || firstName;
  const liveBatchList = batchMeta?.members.slice(0, 8) ?? [];
  const batchList = useDevMocks ? HOME_MOCK_NETWORK_MEMBERS : liveBatchList;
  const handleOpportunityCategoryChange = (category: HomeOpportunityCategory) => setActiveCategory(category);
  const openRepliesTab = () => {
    setActiveCategory("replies");
    window.requestAnimationFrame(() => {
      document.getElementById("home-opportunities-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const handleBulletinPublishSuccess = (posted: IntentcastFeedItem) => {
    queryClient.setQueryData<IntentcastFeedResponse>(["home", "opportunity-rail"], (prev) => {
      if (!prev) return prev;
      const withoutDup = prev.intentcasts.filter((item) => item.id !== posted.id);
      return {
        ...prev,
        intentcasts: [posted, ...withoutDup].slice(0, 48),
      };
    });
    void queryClient.invalidateQueries({
      queryKey: ["home", "opportunity-rail"],
      refetchType: "active",
    });
  };

  return (
    <>
      <PostBulletinFlow ref={bulletinFlowRef} onPublishSuccess={handleBulletinPublishSuccess} />
      <Nav
        variant="home"
        avatarName={displayName}
        toolbarSearchLead
      />
      <div className="home-dashboard home-dashboard--ideal home-dashboard--premium">
        <div className="home-ideal__container">
          <HomeIntentHero />
          <div className="home-activity">
            <HomeSentNotesLine />
            {authPersonId && !useDevMocks ? (
              <HomeFootprintStrip
                myPosts={myPostsQuery.data?.intentcasts ?? EMPTY_POSTS}
                replyCount={bulletinRepliesQuery.data?.totalCount ?? 0}
                viewerPersonId={authPersonId}
                onOpenReplies={openRepliesTab}
              />
            ) : null}
          </div>
          <HomeBrowseRow />
          <OnboardingChecklistCard />
          <HomeAnswerKeyCard />
          <HomeOpportunityRail
            intentcasts={opportunityIntentcasts}
            activeCategory={viewModel.activeCategory}
            onCategoryChange={handleOpportunityCategoryChange}
            categoryCounts={viewModel.categoryCounts}
            opportunitiesFeedLoading={opportunitiesFeedLoading}
            opportunitiesFeedError={opportunitiesQuery.isError}
            viewerPersonId={authPersonId}
            bulletinRepliesFeed={bulletinRepliesQuery.data ?? undefined}
            bulletinRepliesLoading={bulletinRepliesFeedLoading}
            onPost={() => bulletinFlowRef.current?.open()}
          />
          <HomeNetworkPanel
            members={batchList}
            directoryHref={batchDirectorySearchHref}
            countLabel={useDevMocks ? undefined : batchMeta?.countLabel}
          />
          <HomeFeedbackSection />
        </div>
      </div>
    </>
  );
}
