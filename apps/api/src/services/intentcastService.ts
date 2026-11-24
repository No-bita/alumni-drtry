import type { Pool } from "pg";
import type { ExperienceBand, JobFunction } from "../lib/jobFunctions.js";
import { isWebUrl } from "../lib/noteDetails.js";
import {
  BULLETIN_CONTENT_MAX_LENGTH,
  BULLETIN_DESCRIPTION_MAX_CHARS,
  BULLETIN_INTENTCAST_OPEN_DAYS,
  BULLETIN_RESPONSE_MESSAGE_MAX_LENGTH,
  BULLETIN_TITLE_MAX_CHARS
} from "../constants/bulletin.js";
import { AppError } from "../lib/errors.js";
import {
  IntentcastRepo,
  type IntentcastCategory,
  type IntentcastKind,
  type IntentcastFeedView,
  type IntentcastResponseView,
  type IntentcastResolvedOutcome,
  type IntentcastStatus,
  type HiringFieldsInput
} from "../repos/intentcastRepo.js";
import { PersonRepo } from "../repos/personRepo.js";
import {
  audienceLabel,
  buildAudienceSnapshot,
  institutionForEmail,
  isEveryone,
  listInstitutions,
  roundAudienceSize,
  type AudienceInput,
  type AudiencePart,
  type AudienceSize,
  type AudienceSnapshot,
  type AudienceUnavailableReason
} from "../lib/postAudience.js";
import type { EmailSender } from "./emailSender.js";

function splitBulletinHeadlineAndDetails(raw: string): { headline: string; details: string } {
  const lines = raw.trim().split(/\r?\n/);
  const idx = lines.findIndex((l) => l.trim().length > 0);
  if (idx < 0) return { headline: "", details: "" };
  const headlineRaw = lines[idx];
  if (headlineRaw === undefined) return { headline: "", details: "" };
  return {
    headline: headlineRaw.trim(),
    details: lines.slice(idx + 1).join("\n").trim()
  };
}

function assertGeneralIntentcastHeadlineDetails(content: string, category: IntentcastCategory): void {
  if (category === "hiring") return;
  const { headline, details } = splitBulletinHeadlineAndDetails(content);
  if (headline.length > BULLETIN_TITLE_MAX_CHARS) {
    throw new AppError(
      400,
      "INTENTCAST_TITLE_TOO_LONG",
      `Headline must be at most ${BULLETIN_TITLE_MAX_CHARS} characters.`
    );
  }
  if (details.length > BULLETIN_DESCRIPTION_MAX_CHARS) {
    throw new AppError(
      400,
      "INTENTCAST_DESCRIPTION_TOO_LONG",
      `Details must be at most ${BULLETIN_DESCRIPTION_MAX_CHARS} characters.`
    );
  }
}

const HIRING_SHORT_MAX = 120;

/** Checks a hiring post's tapped answers and returns them tidied, or throws a 400. */
function cleanHiringFields(category: IntentcastCategory, input: NonNullable<CreateIntentcastInput["hiring"]>): HiringFieldsInput {
  if (category !== "hiring") {
    throw new AppError(400, "INTENTCAST_BAD_REQUEST", "Hiring details only go with a hiring post.");
  }
  const line = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
  const roleTitle = line(input.roleTitle);
  const location = line(input.location);
  const company = line(input.company);
  for (const [value, label] of [[roleTitle, "Role title"], [location, "Location"], [company, "Company"]] as const) {
    if (value.length > HIRING_SHORT_MAX) {
      throw new AppError(400, "INTENTCAST_BAD_REQUEST", `${label} must be at most ${HIRING_SHORT_MAX} characters.`);
    }
  }
  const applyUrl = line(input.applyUrl);
  if (input.respondVia === "link" && !isWebUrl(applyUrl)) {
    throw new AppError(400, "INTENTCAST_APPLY_LINK_REQUIRED", "Add the application link (starting with https://).");
  }
  return {
    jobFunction: input.jobFunction,
    roleTitle: roleTitle || null,
    experience: input.experience,
    location: location || null,
    company: company || null,
    respondVia: input.respondVia,
    applyUrl: input.respondVia === "link" ? applyUrl : null
  };
}

/**
 * Intentcast categories vs Careers hub (web):
 * - `hiring` — Hire alumni / role posts
 * - `mentorship` — Find referrals (careers referral asks)
 * - `guidance` — Can help offers (stored but omitted from Careers activity feed via `excludeCategories`)
 * - `collaboration` — Relocation / startups bulletin lanes (not shown on Careers activity)
 */
export interface CreateIntentcastInput {
  category: IntentcastCategory;
  content: string;
  /** Ask / Offer / Invitation: the author's own statement; optional so structured flows stay unmarked. */
  kind?: IntentcastKind | null;
  /** Hiring posts from the Wall composer: the tapped answers. */
  hiring?: {
    jobFunction: JobFunction;
    roleTitle?: string | null;
    experience: ExperienceBand;
    location?: string | null;
    company?: string | null;
    respondVia: "reachout" | "link";
    applyUrl?: string | null;
  } | null;
  /** Cities v1: canonical place id when posted from a city page. */
  placeId?: string | null;
  /** Who can see it. Missing or empty = Everyone. Values come from the author's profile, never the client. */
  audience?: AudienceInput | null;
}

/** One of the author's own details, for the audience picker. */
export interface AudienceOptionDetail {
  available: boolean;
  /** Shown beside the checkbox: "2025", "Materials Science", "Bengaluru". */
  value: string | null;
  reason: AudienceUnavailableReason | null;
}

export interface AudienceOptionsView {
  institutions: Array<{ key: string; name: string }>;
  /** The author's own institute key, listed first in the picker. */
  ownInstitutionKey: string | null;
  batch: AudienceOptionDetail;
  department: AudienceOptionDetail;
  city: AudienceOptionDetail;
}

export type AudiencePreviewView =
  | { everyone: true; label: null; size: null }
  | { everyone: false; label: string; size: AudienceSize["size"]; approx?: number };

const AUDIENCE_PART_WORDS: Record<AudiencePart, string> = {
  institution: "institute",
  batch: "batch",
  department: "department",
  city: "city"
};

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

/** Signed-in author — aggregated bulletin replies for Home “Replies” tab. */
export interface ReceivedBulletinReplyFeedItem {
  responseId: string;
  responseCreatedAt: string;
  responseMessage: string;
  intentcastId: string;
  intentcastContent: string;
  responderPersonId: string;
  responderFullName: string;
  responderDepartmentCode: string | null;
  responderBatchYear: number | null;
  responderIsDemo: boolean;
}

export interface ReceivedBulletinRepliesFeedOutput {
  responses: ReceivedBulletinReplyFeedItem[];
  totalCount: number;
  pageInfo: { hasMore: boolean; nextOffset: number | null };
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

  /** Pin is a ranking privilege, never an edit or audience override. */
  async setWallPin(actor: { personId: string; role: string; isDemo?: boolean }, intentcastId: string, pinned: boolean): Promise<{ pinnedAt: Date | null }> {
    if (actor.role !== "admin" && actor.role !== "super_admin") {
      throw new AppError(403, "AUTH_FORBIDDEN", "Admin access required.");
    }
    if (actor.isDemo) throw new AppError(403, "DEMO_READ_ONLY", "Demo accounts are read-only.");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Lock target before slots, matching close/removal trigger lock order.
      const target = await client.query<{ status: string; author_soft_deleted_at: Date | null }>(
        "SELECT status, author_soft_deleted_at FROM intentcasts WHERE id = $1 FOR UPDATE", [intentcastId]
      );
      if (!target.rows[0]) throw new AppError(404, "INTENTCAST_NOT_FOUND", "Post not found.");
      await client.query("SELECT slot FROM wall_post_pins ORDER BY slot FOR UPDATE");
      const repo = new IntentcastRepo(client);
      // Same visibility predicate as direct-link/feed reads. The actor is an admin (checked above), and
      // admins see every post, so a restricted post can be pinned; its audience still decides who sees it.
      const visible = await repo.findFeedItemVisibleToViewer(intentcastId, actor.personId, true);
      if (!visible) throw new AppError(404, "INTENTCAST_NOT_FOUND", "Post not found.");
      if (!pinned) {
        await client.query("UPDATE wall_post_pins SET intentcast_id = NULL, pinned_at = NULL, pinned_by_person_id = NULL WHERE intentcast_id = $1", [intentcastId]);
        await client.query("COMMIT");
        return { pinnedAt: null };
      }
      if (target.rows[0].status !== "open" || target.rows[0].author_soft_deleted_at) {
        throw new AppError(409, "WALL_PIN_UNAVAILABLE", "Only visible, open posts can be pinned.");
      }
      // Clear slots whose posts/authors are unavailable, never reopen or restore anything.
      await client.query(`UPDATE wall_post_pins wp SET intentcast_id = NULL, pinned_at = NULL, pinned_by_person_id = NULL
        FROM intentcasts i JOIN people p ON p.id = i.author_person_id
        WHERE wp.intentcast_id = i.id AND (i.status <> 'open' OR i.author_soft_deleted_at IS NOT NULL
          OR p.deleted_at IS NOT NULL OR p.suspended_at IS NOT NULL OR p.full_name IS NULL)`);
      const existing = await client.query<{ pinned_at: Date }>("SELECT pinned_at FROM wall_post_pins WHERE intentcast_id = $1", [intentcastId]);
      if (existing.rows[0]) {
        await client.query("COMMIT");
        return { pinnedAt: existing.rows[0].pinned_at };
      }
      const result = await client.query<{ pinned_at: Date }>(`UPDATE wall_post_pins SET intentcast_id = $1, pinned_at = clock_timestamp(), pinned_by_person_id = $2
        WHERE slot = (SELECT slot FROM wall_post_pins WHERE intentcast_id IS NULL ORDER BY slot LIMIT 1) RETURNING pinned_at`, [intentcastId, actor.personId]);
      if (!result.rows[0]) throw new AppError(409, "WALL_PIN_LIMIT", "Two posts are already pinned. Unpin one before pinning another.");
      await client.query("COMMIT");
      return { pinnedAt: result.rows[0].pinned_at };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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
    assertGeneralIntentcastHeadlineDetails(content, input.category);
    const hiring = input.hiring ? cleanHiringFields(input.category, input.hiring) : null;

    if (input.placeId) {
      // City review: only an approved city can tag a Wall post (pending and rejected cities stay hidden).
      const place = await this.pool.query(`SELECT 1 FROM canonical_places WHERE id = $1::uuid AND status = 'approved'`, [
        input.placeId
      ]);
      if ((place.rowCount ?? 0) === 0) {
        throw new AppError(400, "INTENTCAST_BAD_REQUEST", "Unknown city.");
      }
    }
    const audience = await this.resolveAudience(authorPersonId, input.audience ?? null, { requireSomeone: true });
    const expiresAt = new Date(
      Date.now() + BULLETIN_INTENTCAST_OPEN_DAYS * 24 * 60 * 60 * 1000
    );
    const created = await this.intentcastRepo
      .create({
        authorPersonId,
        content,
        category: input.category,
        kind: input.kind ?? null,
        expiresAt,
        placeId: input.placeId ?? null,
        audience: audience.snapshot,
        hiring
      })
      .catch((err: unknown) => {
        // Unknown city id (foreign key): a bad request, not a server error.
        if ((err as { code?: string })?.code === "23503") {
          throw new AppError(400, "INTENTCAST_BAD_REQUEST", "Unknown city.");
        }
        throw err;
      });
    const view = await this.intentcastRepo.findFeedItemById(created.id, authorPersonId);
    if (!view) {
      throw new AppError(500, "INTENTCAST_CREATE_FAILED", "Failed to load created intentcast.");
    }
    return view;
  }

  /** One feed card if the viewer may see it (feed rules, or always when viewer is the author). */
  async getFeedItemForViewer(viewerPersonId: string, intentcastId: string, viewerIsAdmin = false): Promise<IntentcastFeedView | null> {
    await this.intentcastRepo.expireOpenIntentcasts();
    await this.intentcastRepo.purgeAuthorSoftDeletedIntentcasts(500);
    return this.intentcastRepo.findFeedItemVisibleToViewer(intentcastId, viewerPersonId, viewerIsAdmin);
  }

  async listFeed(
    viewerPersonId: string,
    limit: number,
    offset: number,
    options?: {
      homeWall?: boolean;
      category?: IntentcastCategory;
      status?: IntentcastStatus;
      mine?: boolean;
      authorHistory?: boolean;
      excludeAuthorSoftDeleted?: boolean;
      excludeCategories?: IntentcastCategory[];
      /** From the actor's role (isAdminRole): admins see posts outside their audience. */
      viewerIsAdmin?: boolean;
    }
  ): Promise<IntentcastFeedOutput> {
    await this.intentcastRepo.expireOpenIntentcasts();
    await this.intentcastRepo.purgeAuthorSoftDeletedIntentcasts(500);
    const result = await this.intentcastRepo.listFeed({
      viewerPersonId,
      homeWall: options?.homeWall,
      limit,
      offset,
      category: options?.category,
      status: options?.status,
      mine: options?.mine,
      authorHistory: options?.authorHistory,
      excludeAuthorSoftDeleted: options?.excludeAuthorSoftDeleted,
      excludeCategories: options?.excludeCategories,
      viewerIsAdmin: options?.viewerIsAdmin
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
    const effectiveCategory = input.category ?? existing.category;
    if (nextContent !== undefined) {
      assertGeneralIntentcastHeadlineDetails(nextContent, effectiveCategory);
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

  /** Close your own open post. With an outcome it closes as resolved (Business progress steps). */
  async closeIntentcast(authorPersonId: string, intentcastId: string, outcome?: IntentcastResolvedOutcome): Promise<void> {
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

    const closed = outcome
      ? await this.intentcastRepo.closeResolved(intentcastId, authorPersonId, outcome)
      : await this.intentcastRepo.closeManually(intentcastId, authorPersonId);
    if (!closed) {
      throw new AppError(409, "INTENTCAST_NOT_OPEN", "Intentcast is already closed.");
    }
  }

  /** What the audience picker can offer this author: institutes, and their own batch, department, city. */
  async getAudienceOptions(authorPersonId: string): Promise<AudienceOptionsView> {
    const facts = await this.intentcastRepo.loadAuthorAudienceFacts(authorPersonId);
    if (!facts) throw new AppError(404, "PERSON_NOT_FOUND", "Member not found.");
    const institutions = listInstitutions();
    const own = institutionForEmail(facts.institutionalEmail, institutions);
    return {
      institutions: institutions.map((i) => ({ key: i.key, name: i.name })),
      ownInstitutionKey: own?.key ?? null,
      batch: {
        available: facts.batchYear !== null,
        value: facts.batchYear !== null ? String(facts.batchYear) : null,
        reason: facts.batchYear !== null ? null : "missing"
      },
      department: {
        available: !facts.departmentUnavailable,
        value: facts.departmentName,
        reason: facts.departmentUnavailable
      },
      city: {
        available: !facts.placeUnavailable,
        value: facts.placeName,
        reason: facts.placeUnavailable
      }
    };
  }

  /** Label and rounded size of an audience, for the picker. Never an exact count. */
  async previewAudience(authorPersonId: string, input: AudienceInput | null): Promise<AudiencePreviewView> {
    const resolved = await this.resolveAudience(authorPersonId, input, { requireSomeone: false });
    if (!resolved.label) return { everyone: true, label: null, size: null };
    const size = roundAudienceSize(resolved.count ?? 0);
    return size.size === "about"
      ? { everyone: false, label: resolved.label, size: "about", approx: size.approx }
      : { everyone: false, label: resolved.label, size: size.size };
  }

  /**
   * Build the stored audience from the author's real details. Refuses a detail the author doesn't have,
   * an unknown institute, and (when posting) an audience no one else matches.
   */
  private async resolveAudience(
    authorPersonId: string,
    input: AudienceInput | null,
    opts: { requireSomeone: boolean }
  ): Promise<{ snapshot: AudienceSnapshot | null; label: string | null; count: number | null }> {
    if (!input || (!input.institution && !input.batch && !input.department && !input.city)) {
      return { snapshot: null, label: null, count: null };
    }
    const facts = await this.intentcastRepo.loadAuthorAudienceFacts(authorPersonId);
    if (!facts) throw new AppError(404, "PERSON_NOT_FOUND", "Member not found.");
    if (input.cityPlaceId) {
      // Resolve an explicit city independently of residence. Never trust a client-supplied label.
      const target = await this.pool.query<{ id: string; city_label: string }>(
        `SELECT cp.id, cp.city_label FROM canonical_places requested
         JOIN canonical_places cp ON cp.id = COALESCE(requested.combined_into_place_id, requested.id)
         WHERE requested.id = $1::uuid AND cp.status = 'approved'`, [input.cityPlaceId]
      );
      const city = target.rows[0];
      if (!city) throw new AppError(400, "AUDIENCE_BAD_REQUEST", "Unknown city.");
      facts.placeId = city.id;
      facts.placeName = city.city_label;
      facts.placeUnavailable = null;
    }
    const built = buildAudienceSnapshot(input, facts, listInstitutions());
    if (!built.ok) {
      if (built.reason === "unknown_institution") {
        throw new AppError(400, "AUDIENCE_BAD_REQUEST", "Unknown institute.");
      }
      const words = built.missing.map((m) => AUDIENCE_PART_WORDS[m]).join(", ");
      throw new AppError(
        422,
        "AUDIENCE_DETAIL_MISSING",
        `Your profile doesn't have a usable ${words} yet, so you can't limit the post by it.`
      );
    }
    if (isEveryone(built.snapshot)) return { snapshot: null, label: null, count: null };
    const label =
      audienceLabel({
        institutionName: built.snapshot.institutionName,
        batchYear: built.snapshot.batchYear,
        departmentName: built.snapshot.departmentName,
        placeName: built.snapshot.placeId ? facts.placeName : null
      }) ?? "A smaller group";
    const count = await this.intentcastRepo.countAudience(authorPersonId, facts.isDemo, built.snapshot);
    if (opts.requireSomeone && count === 0) {
      throw new AppError(
        422,
        "AUDIENCE_EMPTY",
        "No one else matches all of these yet, so nobody would see your post. Remove one and try again."
      );
    }
    return { snapshot: built.snapshot, label, count };
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
    // Outside the post's audience: the same answer as a post that doesn't exist (migration 067).
    // No admin bypass here: admins can see every post but reply only where they are in the audience.
    if (!(await this.intentcastRepo.isInAudience(intentcastId, responderPersonId))) {
      throw new AppError(404, "INTENTCAST_NOT_FOUND", "Intentcast not found.");
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

  async listReceivedResponsesFeed(
    viewerPersonId: string,
    limit: number,
    offset: number
  ): Promise<ReceivedBulletinRepliesFeedOutput> {
    const { rows, totalCount } = await this.intentcastRepo.listReceivedResponsesFeedForAuthor(
      viewerPersonId,
      limit,
      offset
    );
    const responses: ReceivedBulletinReplyFeedItem[] = rows.map((r) => ({
      responseId: r.responseId,
      responseCreatedAt: r.responseCreatedAt.toISOString(),
      responseMessage: r.responseMessage,
      intentcastId: r.intentcastId,
      intentcastContent: r.intentcastContent,
      responderPersonId: r.responderPersonId,
      responderFullName: r.responderFullName?.trim() || "Alumni",
      responderDepartmentCode: r.responderDepartmentCode,
      responderBatchYear: r.responderBatchYear,
      responderIsDemo: r.responderIsDemo
    }));
    const fetchedEnd = offset + rows.length;
    const nextOffset = fetchedEnd < totalCount ? fetchedEnd : null;
    return {
      responses,
      totalCount,
      pageInfo: { hasMore: nextOffset !== null, nextOffset }
    };
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
    // Email pause (2026-11-02): bulletin-response email commented out at the user's request
    // (not deleted - re-enable by restoring the body below).
    void authorPersonId; void response; void postContent;
    // const author = await this.personRepo.findById(authorPersonId);
    // if (!author) return;
    // try {
    //   await this.emailSender.sendIntentcastResponseReceivedEmail({
    //     to: author.institutional_email,
    //     authorName: author.full_name ?? "there",
    //     responderName: response.responderFullName,
    //     postContent,
    //     responseMessage: response.message
    //   });
    // } catch (err) {
    //   const detail = err instanceof Error ? err.message : String(err);
    //   console.error("[intentcast] response email delivery failed:", detail);
    // }
  }
}
