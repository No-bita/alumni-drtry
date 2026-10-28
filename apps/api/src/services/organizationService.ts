import type { Pool } from "pg";
import { AppError } from "../lib/errors.js";
import {
  OrganizationRepo,
  type ApprovedOrganizationOption,
  type OrganizationView,
  type PendingOrganizationView
} from "../repos/organizationRepo.js";

/** Most options the "Same company as…" picker shows at once. */
export const APPROVED_ORG_OPTIONS_MAX = 20;

export interface SuggestOrganizationResult {
  organization: OrganizationView;
  created: boolean;
}

export class OrganizationService {
  private readonly organizationRepo: OrganizationRepo;

  constructor(private readonly pool: Pool) {
    this.organizationRepo = new OrganizationRepo(pool);
  }

  async suggestOrganization(name: string, createdByPersonId: string): Promise<SuggestOrganizationResult> {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      throw new AppError(400, "ORG_INVALID_NAME", "Organization name is too short.");
    }

    const existing = await this.organizationRepo.findByName(trimmedName);
    if (existing) {
      return {
        organization: existing,
        created: false
      };
    }

    const created = await this.organizationRepo.createPending(trimmedName, createdByPersonId);
    return {
      organization: created,
      created: true
    };
  }

  async listPendingOrganizations(limit = 50): Promise<PendingOrganizationView[]> {
    const safeLimit = Math.max(1, Math.min(limit, 200));
    return this.organizationRepo.listPending(safeLimit);
  }

  /** Admin picker: approved, non-linked companies whose name contains `search` (case-insensitive), by name, 20 at most. */
  async searchApprovedOrganizations(search: string): Promise<ApprovedOrganizationOption[]> {
    return this.organizationRepo.listApprovedOptions(search.trim(), APPROVED_ORG_OPTIONS_MAX);
  }

  async approveOrganization(
    organizationId: string,
    reviewedByPersonId: string,
    canonicalOrganizationId: string | null
  ): Promise<OrganizationView> {
    const organization = await this.organizationRepo.findById(organizationId);
    if (!organization) {
      throw new AppError(404, "ORG_NOT_FOUND", "Organization not found.");
    }
    if (organization.approvalStatus !== "pending") {
      throw new AppError(409, "ORG_NOT_PENDING", "Organization is not pending review.");
    }

    let canonicalIdToSet: string | null = null;
    if (canonicalOrganizationId !== null) {
      const canonical = await this.organizationRepo.findById(canonicalOrganizationId);
      if (!canonical || canonical.approvalStatus !== "approved") {
        throw new AppError(
          400,
          "ORG_INVALID_CANONICAL",
          "Canonical organization must exist and be approved."
        );
      }
      if (canonical.id === organization.id) {
        throw new AppError(400, "ORG_INVALID_CANONICAL", "Canonical organization cannot be the same.");
      }
      canonicalIdToSet = canonical.id;
    }

    return this.organizationRepo.approve(organization.id, reviewedByPersonId, canonicalIdToSet);
  }

  async rejectOrganization(
    organizationId: string,
    reviewedByPersonId: string,
    reason: string
  ): Promise<OrganizationView> {
    const organization = await this.organizationRepo.findById(organizationId);
    if (!organization) {
      throw new AppError(404, "ORG_NOT_FOUND", "Organization not found.");
    }
    if (organization.approvalStatus !== "pending") {
      throw new AppError(409, "ORG_NOT_PENDING", "Organization is not pending review.");
    }

    const cleanedReason = reason.trim();
    if (cleanedReason.length < 3) {
      throw new AppError(400, "ORG_REJECT_REASON_REQUIRED", "Rejection reason is required.");
    }

    return this.organizationRepo.reject(organization.id, reviewedByPersonId, cleanedReason);
  }
}

