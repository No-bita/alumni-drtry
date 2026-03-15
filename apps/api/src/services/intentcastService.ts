import type { Pool } from "pg";
import { AppError } from "../lib/errors.js";
import { IntentcastRepo, type IntentcastFeedView, type IntentcastResponseView } from "../repos/intentcastRepo.js";

export interface CreateIntentcastInput {
  content: string;
}

export interface IntentcastFeedOutput {
  intentcasts: IntentcastFeedView[];
  pageInfo: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface RespondIntentcastInput {
  message: string;
}

interface DecodedFeedCursor {
  createdAt: string;
  id: string;
}

const uuidLikePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function encodeCursor(cursor: DecodedFeedCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(raw: string): DecodedFeedCursor {
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { createdAt?: unknown; id?: unknown };
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") {
      throw new Error("invalid cursor fields");
    }
    if (!uuidLikePattern.test(parsed.id)) {
      throw new Error("invalid cursor fields");
    }
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    throw new AppError(400, "INTENTCAST_BAD_CURSOR", "Invalid intentcast feed cursor.");
  }
}

function isPgUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

export class IntentcastService {
  private readonly intentcastRepo: IntentcastRepo;

  constructor(private readonly pool: Pool) {
    this.intentcastRepo = new IntentcastRepo(pool);
  }

  async createIntentcast(authorPersonId: string, input: CreateIntentcastInput): Promise<IntentcastFeedView> {
    const content = input.content.trim();
    if (content.length < 10) {
      throw new AppError(400, "INTENTCAST_CONTENT_TOO_SHORT", "Intentcast content must be at least 10 characters.");
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const created = await this.intentcastRepo.create({
      authorPersonId,
      content,
      expiresAt
    });
    const view = await this.intentcastRepo.findFeedItemById(created.id);
    if (!view) {
      throw new AppError(500, "INTENTCAST_CREATE_FAILED", "Failed to load created intentcast.");
    }
    return view;
  }

  async listFeed(
    viewerPersonId: string,
    limit: number,
    cursor?: string
  ): Promise<IntentcastFeedOutput> {
    await this.intentcastRepo.expireOpenIntentcasts();
    const decodedCursor = cursor ? decodeCursor(cursor) : undefined;
    const result = await this.intentcastRepo.listFeed({
      viewerPersonId,
      limit,
      cursor: decodedCursor
    });

    return {
      intentcasts: result.items,
      pageInfo: {
        hasMore: result.hasMore,
        nextCursor: result.hasMore && result.lastCursor ? encodeCursor(result.lastCursor) : null
      }
    };
  }

  async closeIntentcast(authorPersonId: string, intentcastId: string): Promise<void> {
    await this.intentcastRepo.expireOpenIntentcasts();
    const existing = await this.intentcastRepo.findById(intentcastId);
    if (!existing) {
      throw new AppError(404, "INTENTCAST_NOT_FOUND", "Intentcast not found.");
    }
    if (existing.author_person_id !== authorPersonId) {
      throw new AppError(403, "INTENTCAST_FORBIDDEN", "You can only close your own intentcast.");
    }
    if (existing.status !== "open") {
      throw new AppError(409, "INTENTCAST_NOT_OPEN", "Intentcast is already closed.");
    }

    const closed = await this.intentcastRepo.closeManually(intentcastId, authorPersonId);
    if (!closed) {
      throw new AppError(409, "INTENTCAST_NOT_OPEN", "Intentcast is already closed.");
    }
  }

  async respondToIntentcast(
    responderPersonId: string,
    intentcastId: string,
    input: RespondIntentcastInput
  ): Promise<IntentcastResponseView> {
    await this.intentcastRepo.expireOpenIntentcasts();
    const intentcast = await this.intentcastRepo.findById(intentcastId);
    if (!intentcast) {
      throw new AppError(404, "INTENTCAST_NOT_FOUND", "Intentcast not found.");
    }
    if (intentcast.status !== "open") {
      throw new AppError(409, "INTENTCAST_NOT_OPEN", "Intentcast is closed.");
    }
    if (intentcast.author_person_id === responderPersonId) {
      throw new AppError(400, "INTENTCAST_SELF_RESPONSE", "You cannot respond to your own intentcast.");
    }

    const message = input.message.trim();
    if (message.length < 5) {
      throw new AppError(400, "INTENTCAST_RESPONSE_TOO_SHORT", "Response must be at least 5 characters.");
    }

    try {
      await this.intentcastRepo.createResponse({
        intentcastId,
        responderPersonId,
        message
      });
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new AppError(409, "INTENTCAST_ALREADY_RESPONDED", "You have already responded to this intentcast.");
      }
      throw error;
    }

    const responses = await this.intentcastRepo.listResponsesForIntentcast(intentcastId);
    const created = responses.find((response) => response.responderPersonId === responderPersonId);
    if (!created) {
      throw new AppError(500, "INTENTCAST_RESPONSE_CREATE_FAILED", "Failed to load created response.");
    }
    return created;
  }

  async listResponses(intentcastId: string, actorPersonId: string): Promise<IntentcastResponseView[]> {
    const intentcast = await this.intentcastRepo.findById(intentcastId);
    if (!intentcast) {
      throw new AppError(404, "INTENTCAST_NOT_FOUND", "Intentcast not found.");
    }
    if (intentcast.author_person_id !== actorPersonId) {
      throw new AppError(403, "INTENTCAST_FORBIDDEN", "Only the intentcast author can view responses.");
    }
    return this.intentcastRepo.listResponsesForIntentcast(intentcastId);
  }

  async expireIntentcasts(limit = 2000): Promise<number> {
    return this.intentcastRepo.expireOpenIntentcasts(limit);
  }
}
