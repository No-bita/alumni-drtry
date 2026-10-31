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

export type CareersCompany = { company: string; current: CareersPerson[]; past: CareersPerson[] };
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

export function fetchCareersCompany(name: string, role: string | null, signal: AbortSignal): Promise<CareersCompany> {
  const params = new URLSearchParams({ name: name.trim() });
  if (role?.trim()) params.set("role", role.trim());
  return assertApiGet<CareersCompany>(`/v1/careers/company?${params.toString()}`, signal);
}

export async function fetchReferralCompanies(signal: AbortSignal): Promise<ReferralCompany[]> {
  return (await assertApiGet<{ companies: ReferralCompany[] }>("/v1/careers/referral-companies", signal)).companies;
}

export async function fetchMyCompanyDemand(signal: AbortSignal): Promise<CompanyDemand> {
  return (await assertApiGet<{ demand: CompanyDemand }>("/v1/careers/my-company-demand", signal)).demand;
}

/** "Other things alumni can help with": each opens Ask with its topic chosen. */
export const CAREER_HELP_TOPICS = [
  { category: "interview_prep", label: "Interview prep" },
  { category: "career_switch", label: "Explore a switch" },
  { category: "higher_studies", label: "Higher studies" },
  { category: "relocation", label: "Moving cities" },
] as const;

export const askWithTopicPath = (category: string) => `/match?cat=${encodeURIComponent(category)}`;


