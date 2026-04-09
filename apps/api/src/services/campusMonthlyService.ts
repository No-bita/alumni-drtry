import type { Pool } from "pg";
import { CampusMonthlyRepo } from "../repos/campusMonthlyRepo.js";

export type CampusMonthlyIssuePublic = {
  issueMonth: string;
  headingLabel: string;
};

function headingForIssueMonth(issueMonth: Date): string {
  const label = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    issueMonth
  );
  return `${label} at IIT BHU`;
}

export class CampusMonthlyService {
  private readonly repo: CampusMonthlyRepo;

  constructor(pool: Pool) {
    this.repo = new CampusMonthlyRepo(pool);
  }

  async getLatestPublic(): Promise<CampusMonthlyIssuePublic | null> {
    const row = await this.repo.findLatest();
    if (!row) return null;
    return {
      issueMonth: row.issueMonth.toISOString().slice(0, 10),
      headingLabel: headingForIssueMonth(row.issueMonth)
    };
  }

  async getLatestPdf(): Promise<{ buffer: Buffer; issueMonth: Date } | null> {
    const row = await this.repo.findLatest();
    if (!row) return null;
    return { buffer: row.pdfBytes, issueMonth: row.issueMonth };
  }

  async upsertPdf(input: { issueMonth: Date; pdfBytes: Buffer; uploadedBy: string }) {
    return this.repo.upsertIssue(input);
  }
}
