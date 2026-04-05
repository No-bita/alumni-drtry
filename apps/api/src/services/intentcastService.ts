import type { Pool } from "pg";
import {
  BULLETIN_AUTHOR_DELETE_UNDO_MINUTES,
  BULLETIN_CONTENT_MAX_LENGTH,
  BULLETIN_INTENTCAST_OPEN_DAYS,
  BULLETIN_RESPONSE_MESSAGE_MAX_LENGTH
} from "../constants/bulletin.js";
import { AppError } from "../lib/errors.js";
import {
  IntentcastRepo,
  type IntentcastCategory,
  type IntentcastFeedView,
  type IntentcastResponseView,
  type IntentcastStatus
} from "../repos/intentcastRepo.js";
import { PersonRepo } from "../repos/personRepo.js";
import type { EmailSender } from "./emailSender.js";

export interface CreateIntentcastInput {
  category: IntentcastCategory;
  content: string;
}

export interface IntentcastFeedOutput {
  intentcasts: IntentcastFeedView[];
  pageInfo: {
    hasMore: boolean;
    nextOffset: number | null;
  };
}

export interface UpdateIntentcastInput {
  category?: IntentcastCategory;
  content?: string;
}

export interface RespondIntentcastInput {
  message: string;
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
  private readonly personRepo: PersonRepo;

  constructor(
    private readonly pool: Pool,
    private readonly emailSender: EmailSender,
    private readonly authorDeleteRetentionDays: number
  ) {
    this.intentcastRepo = new IntentcastRepo(pool);
    this.personRepo = new PersonRepo(pool);
  }

  async createIntentcast(authorPersonId: string, input: CreateIntentcastInput): Promise<IntentcastFeedView> {
    const content = input.content.trim();
    if (content.length < 10) {
      throw new AppError(400, "INTENTCAST_CONTENT_TOO_SHORT", "Intentcast content must be at least 10 characters.");
    }
    if (content.length > BULLETIN_CONTENT_MAX_LENGTH) {
      throw new AppError(
        400,
        "INTENTCAST_CONTENT_TOO_LONG",
        `Intentcast content must be at most ${BULLETIN_CONTENT_MAX_LENGTH} characters.`
      );
    }

    const expiresAt = new Date(
      Date.now() + BULLETIN_INTENTCAST_OPEN_DAYS * 24 * 60 * 60 * 1000
    );
    const created = await this.intentcastRepo.create({
      authorPersonId,
      content,
      category: input.category,
      expiresAt
    });
    const view = await this.intentcastRepo.findFeedItemById(created.id, authorPersonId);
    if (!view) {
      throw new AppError(500, "INTENTCAST_CREATE_FAILED", "Failed to load created intentcast.");
    }
    return view;
  }

  /** One feed card if the viewer may see it (feed rules, or always when viewer is the author). */
  async getFeedItemForViewer(viewerPersonId: string, intentcastId: string): Promise<IntentcastFeedView | null> {
    await this.intentcastRepo.expireOpenIntentcasts();
    await this.intentcastRepo.purgeAuthorSoftDeletedIntentcasts(500);
    return this.intentcastRepo.findFeedItemVisibleToViewer(intentcastId, viewerPersonId);
  }

  async listFeed(
    viewerPersonId: string,
    limit: number,
    offset: number,
    options?: {
      category?: IntentcastCategory;
      status?: IntentcastStatus;
      mine?: boolean;
      authorHistory?: boolean;
      excludeAuthorSoftDeleted?: boolean;
    }
  ): Promise<IntentcastFeedOutput> {
    await this.intentcastRepo.expireOpenIntentcasts();
    await this.intentcastRepo.purgeAuthorSoftDeletedIntentcasts(500);
    const result = await this.intentcastRepo.listFeed({
      viewerPersonId,
      limit,
      offset,
      category: options?.category,
      status: options?.status,
      mine: options?.mine,
      authorHistory: options?.authorHistory,
      excludeAuthorSoftDeleted: options?.excludeAuthorSoftDeleted
    });

    return {
      intentcasts: result.items,
      pageInfo: {
        hasMore: result.hasMore,
        nextOffset: result.nextOffset
      }
    };
  }

  async updateIntentcast(
    authorPersonId: string,
    intentcastId: string,
    input: UpdateIntentcastInput
  ): Promise<IntentcastFeedView> {
    await this.intentcastRepo.expireOpenIntentcasts();
    await this.intentcastRepo.purgeAuthorSoftDeletedIntentcasts(500);
    const existing = await this.intentcastRepo.findById(intentcastId);
    if (!existing) {
      throw new AppError(404, "INTENTCAST_NOT_FOUND", "Intentcast not found.");
    }
    if (existing.author_person_id !== authorPersonId) {
      throw new AppError(403, "INTENTCAST_FORBIDDEN", "You can only edit your own intentcast.");
    }
    if (existing.status !== "open") {
      throw new AppError(409, "INTENTCAST_NOT_OPEN", "Intentcast is closed.");
    }
    if (existing.author_soft_deleted_at) {
      throw new AppError(409, "INTENTCAST_NOT_EDITABLE", "This post was removed from the bulletin.");
    }

    const nextContent = input.content?.trim();
    if (nextContent !== undefined && nextContent.length < 10) {
      throw new AppError(400, "INTENTCAST_CONTENT_TOO_SHORT", "Intentcast content must be at least 10 characters.");
    }
    if (nextContent !== undefined && nextContent.length > BULLETIN_CONTENT_MAX_LENGTH) {
      throw new AppError(
        400,
        "INTENTCAST_CONTENT_TOO_LONG",
        `Intentcast content must be at most ${BULLETIN_CONTENT_MAX_LENGTH} characters.`
      );
    }
    const updated = await this.intentcastRepo.updateWithinEditWindow({
      intentcastId,
      authorPersonId,
      content: nextContent,
      category: input.category
    });
    if (!updated) {
      throw new AppError(
        409,
        "INTENTCAST_EDIT_WINDOW_EXPIRED",
        "Intentcasts can only be edited within 5 minutes of posting."
      );
    }
    const view = await this.intentcastRepo.findFeedItemById(updated.id, authorPersonId);
    if (!view) {
      throw new AppError(500, "INTENTCAST_UPDATE_FAILED", "Failed to load updated intentcast.");
    }
    return view;
  }

  async deleteIntentcast(authorPersonId: string, intentcastId: string): Promise<IntentcastFeedView> {
    await this.intentcastRepo.expireOpenIntentcasts();
    await this.intentcastRepo.purgeAuthorSoftDeletedIntentcasts(500);
    const existing = await this.intentcastRepo.findById(intentcastId);
    if (!existing) {
      throw new AppError(404, "INTENTCAST_NOT_FOUND", "Intentcast not found.");
    }
    if (existing.author_person_id !== authorPersonId) {
      throw new AppError(403, "INTENTCAST_FORBIDDEN", "You can only delete your own intentcast.");
    }
    if (existing.author_soft_deleted_at) {
      throw new AppError(409, "INTENTCAST_ALREADY_REMOVED", "This post is already removed from the bulletin.");
    }
    const purgeAt = new Date(
      Date.now() + this.authorDeleteRetentionDays * 24 * 60 * 60 * 1000
    );
    const updated = await this.intentcastRepo.softDeleteByAuthor(intentcastId, authorPersonId, purgeAt);
    if (!updated) {
      throw new AppError(404, "INTENTCAST_NOT_FOUND", "Intentcast not found.");
    }
    const view = await this.intentcastRepo.findFeedItemById(intentcastId, authorPersonId);
    if (!view) {
      throw new AppError(500, "INTENTCAST_DELETE_FAILED", "Failed to load intentcast after delete.");
    }
    return view;
  }

  async undoDeleteIntentcast(authorPersonId: string, intentcastId: string): Promise<IntentcastFeedView> {
    await this.intentcastRepo.expireOpenIntentcasts();
    await this.intentcastRepo.purgeAuthorSoftDeletedIntentcasts(500);
    const existing = await this.intentcastRepo.findById(intentcastId);
    if (!existing) {
      throw new AppError(404, "INTENTCAST_NOT_FOUND", "Intentcast not found.");
    }
    if (existing.author_person_id !== authorPersonId) {
      throw new AppError(403, "INTENTCAST_FORBIDDEN", "You can only restore your own intentcast.");
    }
    if (!existing.author_soft_deleted_at) {
      throw new AppError(409, "INTENTCAST_NOT_REMOVED", "This post is not removed from the bulletin.");
    }
    const undoDeadline =
      existing.author_soft_deleted_at.getTime() + BULLETIN_AUTHOR_DELETE_UNDO_MINUTES * 60 * 1000;
    if (Date.now() > undoDeadline) {
      throw new AppError(
        409,
        "INTENTCAST_UNDO_WINDOW_EXPIRED",
        "The time window to undo removal has passed."
      );
    }
    const updated = await this.intentcastRepo.restoreAuthorSoftDeletedIntentcast(
      intentcastId,
      authorPersonId
    );
    if (!updated) {
      throw new AppError(
        409,
        "INTENTCAST_UNDO_WINDOW_EXPIRED",
        "The time window to undo removal has passed."
      );
    }
    const view = await this.intentcastRepo.findFeedItemById(intentcastId, authorPersonId);
    if (!view) {
      throw new AppError(500, "INTENTCAST_RESTORE_FAILED", "Failed to load intentcast after restore.");
    }
    return view;
  }

  async closeIntentcast(authorPersonId: string, intentcastId: string): Promise<void> {
    await this.intentcastRepo.expireOpenIntentcasts();
    await this.intentcastRepo.purgeAuthorSoftDeletedIntentcasts(500);
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
    if (existing.author_soft_deleted_at) {
      throw new AppError(409, "INTENTCAST_NOT_OPEN", "Intentcast is not open.");
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
    await this.intentcastRepo.purgeAuthorSoftDeletedIntentcasts(500);
    const intentcast = await this.intentcastRepo.findById(intentcastId);
    if (!intentcast) {
      throw new AppError(404, "INTENTCAST_NOT_FOUND", "Intentcast not found.");
    }
    if (intentcast.status !== "open") {
      throw new AppError(409, "INTENTCAST_NOT_OPEN", "Intentcast is closed.");
    }
    if (intentcast.author_soft_deleted_at) {
      throw new AppError(404, "INTENTCAST_NOT_FOUND", "Intentcast not found.");
    }
    if (intentcast.author_person_id === responderPersonId) {
      throw new AppError(400, "INTENTCAST_SELF_RESPONSE", "You cannot respond to your own intentcast.");
    }

    const message = input.message.trim();
    if (message.length < 5) {
      throw new AppError(400, "INTENTCAST_RESPONSE_TOO_SHORT", "Response must be at least 5 characters.");
    }
    if (message.length > BULLETIN_RESPONSE_MESSAGE_MAX_LENGTH) {
      throw new AppError(
        400,
        "INTENTCAST_RESPONSE_TOO_LONG",
        `Response must be at most ${BULLETIN_RESPONSE_MESSAGE_MAX_LENGTH} characters.`
      );
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
    await this.sendResponseEmail(intentcast.author_person_id, created, intentcast.content);
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

  async purgeSoftDeletedIntentcasts(limit = 500): Promise<number> {
    return this.intentcastRepo.purgeAuthorSoftDeletedIntentcasts(limit);
  }

  private async sendResponseEmail(
    authorPersonId: string,
    response: IntentcastResponseView,
    postContent: string
  ): Promise<void> {
    const author = await this.personRepo.findById(authorPersonId);
    if (!author) return;
    try {
      await this.emailSender.sendIntentcastResponseReceivedEmail({
        to: author.institutional_email,
        authorName: author.full_name ?? "there",
        responderName: response.responderFullName,
        postContent,
        responseMessage: response.message
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[intentcast] response email delivery failed:", detail);
    }
  }
}
