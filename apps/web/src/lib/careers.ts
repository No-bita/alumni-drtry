import { assertApiGet } from "./assertApiGet";

/** A person on the Careers company screen (GET /v1/careers/company). */
export type CareersPerson = {
  id: string;
  fullName: string;
  batchYear: number | null;
  roleTitle: string;
  organizationName: string;
  openToReferrals: boolean;
  yourNote: "pending" | "accepted" | "declined" | "expired" | null;
};

export type CareersCompany = {
  company: string;
  current: CareersPerson[];
  past: CareersPerson[];
  pageInfo: { nextCursor: string | null };
};
export type ReferralCompany = { company: string; alumni: number };
export type CompanyDemand = { company: string; asks: number; days: number } | null;

export const CAREERS_KEY = ["careers"] as const;
export const careersKeys = {
  company: (name: string) => ["careers", "company", name.trim().toLowerCase()] as const,
  referralCompanies: () => ["careers", "referral-companies"] as const,
  myCompanyDemand: () => ["careers", "my-company-demand"] as const,
};

/** Careers company screen: /intent/career/company?name=…&role=… */
export function careersCompanyPath(name: string, role?: string | null): string {
  const params = new URLSearchParams({ name: name.trim() });
  if (role?.trim()) params.set("role", role.trim());
  return `/intent/career/company?${params.toString()}`;
}

export function fetchCareersCompany(name: string, role: string | null, cursor: string | null, signal: AbortSignal): Promise<CareersCompany> {
  const params = new URLSearchParams({ name: name.trim() });
  if (role?.trim()) params.set("role", role.trim());
  if (cursor) params.set("cursor", cursor);
  return assertApiGet<CareersCompany>(`/v1/careers/company?${params.toString()}`, signal);
}

export async function fetchReferralCompanies(signal: AbortSignal): Promise<ReferralCompany[]> {
  return (await assertApiGet<{ companies: ReferralCompany[] }>("/v1/careers/referral-companies", signal)).companies;
}

export async function fetchMyCompanyDemand(signal: AbortSignal): Promise<CompanyDemand> {
  return (await assertApiGet<{ demand: CompanyDemand }>("/v1/careers/my-company-demand", signal)).demand;
}

export const askWithTopicPath = (category: string) => `/match?cat=${encodeURIComponent(category)}`;

/** Ask with a typed question already filled in (Ask works out the company, role and topic itself). */
export const askWithQuestionPath = (question: string) => `/match?q=${encodeURIComponent(question.trim())}`;

export type CareerTopicIcon = "referral" | "interview" | "switch" | "studies" | "advice";

/** Careers shortcuts under the search: each opens Ask, with its topic chosen when Ask has one. */
export const CAREER_HELP_TOPICS: ReadonlyArray<{ label: string; to: string; icon: CareerTopicIcon }> = [
  { label: "Get a referral", to: askWithTopicPath("referral"), icon: "referral" },
  { label: "Prepare for interviews", to: askWithTopicPath("interview_prep"), icon: "interview" },
  { label: "Explore a switch", to: askWithTopicPath("career_switch"), icon: "switch" },
  { label: "Higher studies", to: askWithTopicPath("higher_studies"), icon: "studies" },
  // Ask has no general advice topic, so this opens Ask with nothing chosen.
  { label: "Get career advice", to: "/match", icon: "advice" },
];


