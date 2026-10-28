import type { Pool } from "pg";
import { CareersRepo, type CompanyPersonRow } from "../repos/careersRepo.js";
import type { ContactRequestStatus } from "../repos/contactRequestRepo.js";
import { MatchRepo } from "../repos/matchRepo.js";

/** "People asked about your company" looks back this far. */
export const COMPANY_DEMAND_DAYS = 30;

export interface CareersNoteStatusSource {
  latestStatusFromSender(senderPersonId: string, recipientPersonIds: readonly string[]): Promise<Map<string, ContactRequestStatus>>;
}

export interface CareersCompanyPerson {
  id: string;
  fullName: string;
  batchYear: number | null;
  roleTitle: string;
  /** The company name on their job entry (may be a linked name such as "Goldman" for Goldman Sachs). */
  organizationName: string;
  openToReferrals: boolean;
  /** Your latest note to them, if any. */
  yourNote: ContactRequestStatus | null;
}

export interface CareersCompanyResult {
  /** The directory's spelling when it knows the company, else the name as typed. */
  company: string;
  /** Working there now: open to referrals first. */
  current: CareersCompanyPerson[];
  /** Worked there before (and not now). */
  past: CareersCompanyPerson[];
}

/** Careers page: who is at a company, where you can get referred, and demand for your company. */
export class CareersService {
  private readonly repo: CareersRepo;
  private readonly matchRepo: MatchRepo;

  constructor(
    pool: Pool,
    private readonly notes: CareersNoteStatusSource
  ) {
    this.repo = new CareersRepo(pool);
    this.matchRepo = new MatchRepo(pool);
  }

  async company(input: {
    name: string;
    role: string | null;
    viewerPersonId: string;
    viewerIsDemo: boolean;
  }): Promise<CareersCompanyResult> {
    const typed = input.name.trim().replace(/\s+/g, " ");
    const [rows, known] = await Promise.all([
      this.repo.peopleAtCompany(typed, input.viewerPersonId, input.viewerIsDemo),
      this.repo.displayName(typed)
    ]);
    const statuses = await this.notes.latestStatusFromSender(
      input.viewerPersonId,
      rows.map((r) => r.id)
    );
    const toPerson = (r: CompanyPersonRow): CareersCompanyPerson => ({
      id: r.id,
      fullName: r.full_name,
      batchYear: r.batch_year,
      roleTitle: r.role_title,
      organizationName: r.org_name,
      openToReferrals: r.open_to_referrals,
      yourNote: statuses.get(r.id) ?? null
    });
    const result: CareersCompanyResult = {
      company: known ?? typed,
      current: rows.filter((r) => r.is_current).map(toPerson),
      past: rows.filter((r) => !r.is_current).map(toPerson)
    };

    // A company looked up here counts as demand, like an Ask referral question (marked "careers").
    // The demo account's lookups are left out of the numbers.
    if (!input.viewerIsDemo) {
      await this.matchRepo
        .logQuery({
          category: "referral",
          detectedFields: input.role ? ["company", "role"] : ["company"],
          parserSource: "careers",
          resultCount: result.current.length,
          hadOverrides: false,
          needsDetail: false,
          company: result.company,
          role: input.role
        })
        .catch(() => undefined);
    }
    return result;
  }

  async referralCompanies(viewerPersonId: string, viewerIsDemo: boolean) {
    return this.repo.referralCompanies(viewerPersonId, viewerIsDemo);
  }

  async myCompanyDemand(personId: string) {
    const demand = await this.repo.demandForCurrentCompany(personId, COMPANY_DEMAND_DAYS);
    return demand ? { ...demand, days: COMPANY_DEMAND_DAYS } : null;
  }
}
