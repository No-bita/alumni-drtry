import type { Pool } from "pg";
import { AppError } from "../lib/errors.js";
import {
  DiscoveryRepo,
  type PublicProfileBaseView,
  type SearchProfileView
} from "../repos/discoveryRepo.js";
import { LinkRepo } from "../repos/linkRepo.js";
import type { ProfileLinkView } from "../repos/linkRepo.js";
import { OccupationRepo } from "../repos/occupationRepo.js";
import type { OccupationView } from "../repos/occupationRepo.js";

export interface SearchInput {
  batchYear?: number;
  departmentCode?: string;
  organizationId?: string;
  occupationTypeCode?: string;
  keyword?: string;
  limit: number;
  cursor?: string;
}

export interface SearchPageInfo {
  hasMore: boolean;
  nextCursor: string | null;
}

export interface SearchOutput {
  results: SearchProfileView[];
  pageInfo: SearchPageInfo;
}

export interface PublicProfileOutput {
  profile: PublicProfileBaseView;
  occupations: OccupationView[];
  links: ProfileLinkView[];
}

interface DecodedCursor {
  name: string;
  id: string;
}

const uuidLikePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function encodeCursor(cursor: DecodedCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(raw: string): DecodedCursor {
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { name?: unknown; id?: unknown };
    if (typeof parsed.name !== "string" || typeof parsed.id !== "string") {
      throw new Error("invalid cursor fields");
    }
    if (!uuidLikePattern.test(parsed.id)) {
      throw new Error("invalid cursor fields");
    }
    return { name: parsed.name, id: parsed.id };
  } catch {
    throw new AppError(400, "SEARCH_BAD_CURSOR", "Invalid cursor.");
  }
}

export class DiscoveryService {
  private readonly discoveryRepo: DiscoveryRepo;
  private readonly occupationRepo: OccupationRepo;
  private readonly linkRepo: LinkRepo;

  constructor(private readonly pool: Pool) {
    this.discoveryRepo = new DiscoveryRepo(pool);
    this.occupationRepo = new OccupationRepo(pool);
    this.linkRepo = new LinkRepo(pool);
  }

  async search(input: SearchInput): Promise<SearchOutput> {
    const keyword =
      input.keyword !== undefined
        ? input.keyword.trim().length > 0
          ? input.keyword.trim()
          : undefined
        : undefined;
    const decodedCursor = input.cursor ? decodeCursor(input.cursor) : undefined;

    const searchResult = await this.discoveryRepo.searchProfiles({
      batchYear: input.batchYear,
      departmentCode: input.departmentCode,
      organizationId: input.organizationId,
      occupationTypeCode: input.occupationTypeCode,
      keyword,
      limit: input.limit,
      cursor: decodedCursor
    });

    const nextCursor = searchResult.hasMore && searchResult.lastCursor
      ? encodeCursor(searchResult.lastCursor)
      : null;

    return {
      results: searchResult.rows,
      pageInfo: {
        hasMore: searchResult.hasMore,
        nextCursor
      }
    };
  }

  async getPublicProfile(profileId: string): Promise<PublicProfileOutput> {
    const profile = await this.discoveryRepo.findPublicProfileBaseById(profileId);
    if (!profile) {
      throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found.");
    }

    const [occupations, links] = await Promise.all([
      this.occupationRepo.listByPerson(profile.id),
      this.linkRepo.listByPerson(profile.id)
    ]);

    return {
      profile,
      occupations,
      links
    };
  }
}
