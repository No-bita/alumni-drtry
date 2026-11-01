import type { Pool } from "pg";
import { AppError } from "../lib/errors.js";
import {
  OrganizationRepo,
  type ApprovedOrganizationListItem,
  type ApprovedOrganizationOption,
  type OrganizationView,
  type PendingOrganizationView,
  type RejectedOrganizationFlag
} from "../repos/organizationRepo.js";

/** Most options the "Same company as…" picker shows at once. */
export const APPROVED_ORG_OPTIONS_MAX = 20;
/** Most rows the "Approved companies" section shows at once. */
export const APPROVED_ORG_LIST_MAX = 50;
export const ORG_NAME_MIN = 2;
export const ORG_NAME_MAX = 120;

/** Control characters out, runs of spaces to one, ends trimmed. */
export function cleanOrganizationName(raw: string): string {
  return raw.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}

/** Who already has the name an admin tried to rename to, and what (if anything) it can be linked to instead. */
export interface NameTaken {
  id: string;
  name: string;
  status: "approved" | "linked" | "pending" | "rejected";
  /** For a linked name: the main company it's linked to. */
  linkedToName: string | null;
  /** The main company the renamed one can be marked "Same company as" instead; null when that isn't possible. */
  linkTo: { id: string; name: string } | null;
}

export type RenameResult = { result: "renamed"; organization: OrganizationView } | { result: "taken"; existing: NameTaken };

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

  /** Company review's "Approved companies" section: every approved name, linked or not. */
  async listApprovedCompanies(search: string): Promise<ApprovedOrganizationListItem[]> {
    return this.organizationRepo.listApproved(search.trim(), APPROVED_ORG_LIST_MAX);
  }

  /**
   * Rename a pending or approved company (everyone who picked it sees the new name).
   * If another company already has the name, nothing changes and the result says who has it.
   */
  async renameOrganization(organizationId: string, rawName: string): Promise<RenameResult> {
    const name = cleanOrganizationName(rawName);
    if (name.length < ORG_NAME_MIN || name.length > ORG_NAME_MAX) {
      throw new AppError(400, "ORG_INVALID_NAME", `Company names are ${ORG_NAME_MIN} to ${ORG_NAME_MAX} characters.`);
    }
    const organization = await this.organizationRepo.findById(organizationId);
    if (!organization) {
      throw new AppError(404, "ORG_NOT_FOUND", "Organization not found.");
    }
    if (organization.approvalStatus === "rejected") {
      throw new AppError(409, "ORG_REJECTED", "Rejected companies can't be renamed.");
    }
    if (name === organization.name) {
      throw new AppError(400, "ORG_NAME_UNCHANGED", "That's already its name.");
    }

    const taken = await this.nameTaken(name, organization.id);
    if (taken) return { result: "taken", existing: taken };

    try {
      return { result: "renamed", organization: await this.organizationRepo.rename(organization.id, name) };
    } catch (err) {
      // Someone else took the name between the check and the update.
      if ((err as { code?: string }).code === "23505") {
        const now = await this.nameTaken(name, organization.id);
        if (now) return { result: "taken", existing: now };
      }
      throw err;
    }
  }

  private async nameTaken(name: string, selfId: string): Promise<NameTaken | null> {
    const existing = await this.organizationRepo.findByName(name);
    if (!existing || existing.id === selfId) return null;
    if (existing.approvalStatus !== "approved") {
      return { id: existing.id, name: existing.name, status: existing.approvalStatus, linkedToName: null, linkTo: null };
    }
    const main = existing.canonicalOrganizationId ? await this.organizationRepo.findById(existing.canonicalOrganizationId) : existing;
    const usableMain = main && main.approvalStatus === "approved" && main.canonicalOrganizationId === null && main.id !== selfId ? main : null;
    return {
      id: existing.id,
      name: existing.name,
      status: existing.canonicalOrganizationId ? "linked" : "approved",
      linkedToName: existing.canonicalOrganizationId ? (main?.name ?? null) : null,
      linkTo: usableMain ? { id: usableMain.id, name: usableMain.name } : null
    };
  }

  /**
   * "Same company as…" for an already approved company. Names linked to it move to the new main company,
   * so links stay one level deep. Nothing is deleted and nobody's job changes.
   */
  async linkApprovedOrganization(
    organizationId: string,
    canonicalOrganizationId: string
  ): Promise<{ organization: OrganizationView; movedLinkedNames: number }> {
    const organization = await this.organizationRepo.findById(organizationId);
    if (!organization) {
      throw new AppError(404, "ORG_NOT_FOUND", "Organization not found.");
    }
    if (organization.approvalStatus !== "approved") {
      throw new AppError(409, "ORG_NOT_APPROVED", "Only approved companies can be linked this way.");
    }
    const canonical = await this.organizationRepo.findById(canonicalOrganizationId);
    if (
      !canonical ||
      canonical.approvalStatus !== "approved" ||
      canonical.canonicalOrganizationId !== null ||
      canonical.id === organization.id
    ) {
      throw new AppError(400, "ORG_INVALID_CANONICAL", "Pick an approved company that isn't linked to another.");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const repo = new OrganizationRepo(client);
      const movedLinkedNames = await repo.moveLinkedNames(organization.id, canonical.id);
      const updated = await repo.setCanonical(organization.id, canonical.id);
      await client.query("COMMIT");
      return { organization: updated, movedLinkedNames };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Rejected companies on the signed-in person's own job entries (drives the own-profile flag). */
  async listRejectedForPerson(personId: string): Promise<RejectedOrganizationFlag[]> {
    return this.organizationRepo.listRejectedForPerson(personId);
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

