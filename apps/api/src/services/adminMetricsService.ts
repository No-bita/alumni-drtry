import type { Pool } from "pg";
import type { AdminMetrics } from "../repos/adminMetricsRepo.js";
import { AdminMetricsRepo } from "../repos/adminMetricsRepo.js";

export class AdminMetricsService {
  private readonly repo: AdminMetricsRepo;

  constructor(private readonly pool: Pool) {
    this.repo = new AdminMetricsRepo(pool);
  }

  async getMetrics(): Promise<AdminMetrics> {
    return this.repo.getMetrics();
  }

  async logSearch(): Promise<void> {
    await this.repo.logSearch();
  }
}
