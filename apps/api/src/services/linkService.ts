import type { Pool } from "pg";
import { AppError } from "../lib/errors.js";
import { LinkRepo, type ProfileLinkView } from "../repos/linkRepo.js";

export interface UpsertLinkInput {
  platform: string;
  url: string;
  label?: string | null;
}

function normalizeLinkText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isPgUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export class LinkService {
  private readonly linkRepo: LinkRepo;

  constructor(private readonly pool: Pool) {
    this.linkRepo = new LinkRepo(pool);
  }

  async listMyLinks(personId: string): Promise<ProfileLinkView[]> {
    return this.linkRepo.listByPerson(personId);
  }

  async createMyLink(personId: string, input: UpsertLinkInput): Promise<ProfileLinkView> {
    const platform = input.platform.trim();
    const url = input.url.trim();
    const label = normalizeLinkText(input.label);

    try {
      return await this.linkRepo.create({
        personId,
        platform,
        url,
        label
      });
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new AppError(409, "LINK_DUPLICATE", "This link already exists on your profile.");
      }
      throw error;
    }
  }

  async updateMyLink(
    personId: string,
    linkId: string,
    patch: Partial<UpsertLinkInput>
  ): Promise<ProfileLinkView> {
    const current = await this.linkRepo.findByIdAndPerson(linkId, personId);
    if (!current) {
      throw new AppError(404, "LINK_NOT_FOUND", "Link not found.");
    }

    const platform = patch.platform !== undefined ? patch.platform.trim() : current.platform;
    const url = patch.url !== undefined ? patch.url.trim() : current.url;
    const label = patch.label !== undefined ? normalizeLinkText(patch.label) : current.label;

    try {
      return await this.linkRepo.update({
        linkId,
        personId,
        platform,
        url,
        label
      });
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new AppError(409, "LINK_DUPLICATE", "This link already exists on your profile.");
      }
      throw error;
    }
  }

  async deleteMyLink(personId: string, linkId: string): Promise<void> {
    const deleted = await this.linkRepo.deleteByIdAndPerson(linkId, personId);
    if (!deleted) {
      throw new AppError(404, "LINK_NOT_FOUND", "Link not found.");
    }
  }
}

