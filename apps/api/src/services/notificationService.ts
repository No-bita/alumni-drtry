import type { NoteDetails } from "../lib/noteDetails.js";
import type { Pool } from "pg";
import { ConnectionThreadRepo } from "../repos/connectionThreadRepo.js";
import { ContactRequestRepo } from "../repos/contactRequestRepo.js";
import { CitiesRepo } from "../repos/citiesRepo.js";
import { IntentcastRepo } from "../repos/intentcastRepo.js";
import type { AnnouncementService } from "./announcementService.js";

const POST_PREVIEW_MAX = 160;
const THREAD_PREVIEW_MAX = 140;
const OUTGOING_RESOLVED_LIMIT = 1000;
const BULLETIN_RESPONSE_LIMIT = 1000;
const CITY_OFFER_LIMIT = 200;
const ANNOUNCEMENT_LIMIT = 50;

function truncatePreview(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export type NotificationItemDto =
  | {
      kind: "contact_request_received";
      id: string;
      occurredAt: string;
      /** True when this item is newer than the person's seen watermark. */
      unseen: boolean;
      contactRequestId: string;
      senderPersonId: string;
      senderFullName: string | null;
      message: string;
      /** Note form fields (null on older notes). */
      details: NoteDetails | null;
      /** Where the note came from and its category (e.g. "cities" + "coffee"), for wording. */
      source: string | null;
      sourceCategory: string | null;
    }
  | {
      /** Cities v1: a local offered to help the newcomer settle in (in-app only, never a message). */
      kind: "city_help_offer_received";
      id: string;
      occurredAt: string;
      /** True when this item is newer than the person's seen watermark. */
      unseen: boolean;
      offerId: string;
      offererPersonId: string;
      offererFullName: string | null;
      kinds: string[];
      cityName: string;
    }
  | {
      kind: "contact_request_resolved";
      id: string;
      occurredAt: string;
      /** True when this item is newer than the person's seen watermark. */
      unseen: boolean;
      contactRequestId: string;
      outcome: "accepted" | "declined";
      recipientPersonId: string;
      recipientFullName: string | null;
    }
  | {
      kind: "bulletin_response";
      id: string;
      occurredAt: string;
      /** True when this item is newer than the person's seen watermark. */
      unseen: boolean;
      responseId: string;
      intentcastId: string;
      postPreview: string;
      responderPersonId: string;
      responderFullName: string;
      responseMessage: string;
    }
  | {
      /** Admin announcement (in-app channel): title, plain-text message, optional link inside the app. */
      kind: "announcement";
      id: string;
      occurredAt: string;
      /** True when this item is newer than the person's seen watermark. */
      unseen: boolean;
      announcementId: string;
      title: string;
      body: string;
      /** Path inside the web app (e.g. "/intent/career"), or null. */
      linkPath: string | null;
    }
  | {
      kind: "connection_thread_reply";
      id: string;
      occurredAt: string;
      /** True when this item is newer than the person's seen watermark. */
      unseen: boolean;
      threadId: string;
      counterpartyPersonId: string;
      counterpartyFullName: string | null;
      lastMessagePreview: string;
    };

export class NotificationService {
  private readonly pool: Pool;
  private readonly contactRequestRepo: ContactRequestRepo;
  private readonly connectionThreadRepo: ConnectionThreadRepo;
  private readonly intentcastRepo: IntentcastRepo;
  private readonly citiesRepo: CitiesRepo;

  private readonly announcements: AnnouncementService | null;

  constructor(pool: Pool, announcements: AnnouncementService | null = null) {
    this.pool = pool;
    this.announcements = announcements;
    this.citiesRepo = new CitiesRepo(pool);
    this.contactRequestRepo = new ContactRequestRepo(pool);
    this.connectionThreadRepo = new ConnectionThreadRepo(pool);
    this.intentcastRepo = new IntentcastRepo(pool);
  }

  /** The person's seen watermark; a missing row means nothing has ever been marked seen. */
  private async getSeenWatermark(personId: string): Promise<Date> {
    const { rows } = await this.pool.query<{ seen_watermark: Date }>(
      `SELECT seen_watermark FROM person_notification_state WHERE person_id = $1`,
      [personId]
    );
    return rows[0]?.seen_watermark ?? new Date(0);
  }

  /** Mark every current notification as seen. Moves the watermark only; no history is touched. */
  async markAllSeen(personId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO person_notification_state (person_id, seen_watermark) VALUES ($1, clock_timestamp())
       ON CONFLICT (person_id) DO UPDATE SET seen_watermark = EXCLUDED.seen_watermark`,
      [personId]
    );
  }

  /** Unseen count from the same aggregation the list uses, so the badge and the list always agree. */
  async unseenCountForPerson(personId: string): Promise<number> {
    const items = await this.listForPerson(personId);
    return items.reduce((n, item) => n + (item.unseen ? 1 : 0), 0);
  }

  async listForPerson(personId: string): Promise<NotificationItemDto[]> {
    const watermark = await this.getSeenWatermark(personId);
    const unseen = (occurredAt: string) => Date.parse(occurredAt) > watermark.getTime();
    const [pendingIncoming, resolvedOutgoing, bulletinResponses, threadReplies, cityOffers, announcements] = await Promise.all([
      this.contactRequestRepo.listPendingIncomingForRecipient(personId),
      this.contactRequestRepo.listResolvedOutgoingForSender(personId, OUTGOING_RESOLVED_LIMIT),
      this.intentcastRepo.listBulletinResponseNotificationsForAuthor(personId, BULLETIN_RESPONSE_LIMIT),
      this.connectionThreadRepo.listThreadNotificationRowsForRecipient(personId, 50),
      this.citiesRepo.offerNotifications(personId, CITY_OFFER_LIMIT),
      this.announcements ? this.announcements.notificationsForPerson(personId, ANNOUNCEMENT_LIMIT) : Promise.resolve([])
    ]);

    const items: NotificationItemDto[] = [];

    for (const p of pendingIncoming) {
      items.push({
        kind: "contact_request_received",
        id: `cr-in:${p.id}`,
        occurredAt: p.createdAt.toISOString(),
        unseen: unseen(p.createdAt.toISOString()),
        contactRequestId: p.id,
        senderPersonId: p.senderPersonId,
        senderFullName: p.senderFullName,
        message: p.message,
        details: p.details,
        source: p.source,
        sourceCategory: p.sourceCategory
      });
    }

    for (const o of cityOffers) {
      items.push({
        kind: "city_help_offer_received",
        id: `city-offer:${o.offer_id}`,
        occurredAt: o.created_at.toISOString(),
        unseen: unseen(o.created_at.toISOString()),
        offerId: o.offer_id,
        offererPersonId: o.offerer_person_id,
        offererFullName: o.offerer_full_name,
        kinds: o.kinds,
        cityName: o.city
      });
    }

    for (const r of resolvedOutgoing) {
      items.push({
        kind: "contact_request_resolved",
        id: `cr-out:${r.id}`,
        occurredAt: r.respondedAt.toISOString(),
        unseen: unseen(r.respondedAt.toISOString()),
        contactRequestId: r.id,
        outcome: r.status,
        recipientPersonId: r.recipientPersonId,
        recipientFullName: r.recipientFullName
      });
    }

    for (const b of bulletinResponses) {
      items.push({
        kind: "bulletin_response",
        id: `ir:${b.responseId}`,
        occurredAt: b.responseCreatedAt.toISOString(),
        unseen: unseen(b.responseCreatedAt.toISOString()),
        responseId: b.responseId,
        intentcastId: b.intentcastId,
        postPreview: truncatePreview(b.intentcastContent, POST_PREVIEW_MAX),
        responderPersonId: b.responderPersonId,
        responderFullName: b.responderFullName?.trim() || "Alumni",
        responseMessage: b.responseMessage
      });
    }

    for (const tr of threadReplies) {
      items.push({
        kind: "connection_thread_reply",
        id: `ct:${tr.threadId}`,
        occurredAt: tr.lastCreatedAt.toISOString(),
        unseen: unseen(tr.lastCreatedAt.toISOString()),
        threadId: tr.threadId,
        counterpartyPersonId: tr.counterpartyPersonId,
        counterpartyFullName: tr.counterpartyFullName,
        lastMessagePreview: truncatePreview(tr.lastBody, THREAD_PREVIEW_MAX)
      });
    }

    for (const a of announcements) {
      items.push({
        kind: "announcement",
        id: `ann:${a.id}`,
        occurredAt: a.occurredAt.toISOString(),
        unseen: unseen(a.occurredAt.toISOString()),
        announcementId: a.id,
        title: a.title,
        body: a.body,
        linkPath: a.linkPath
      });
    }

    items.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
    return items;
  }

  /** Total notification rows (matches aggregation behind GET /v1/notifications, without row limits). */
  async countForPerson(personId: string): Promise<number> {
    const [pending, resolvedOut, bulletin, threadReplies, cityOffers, announcements] = await Promise.all([
      this.contactRequestRepo.countPendingIncomingForRecipient(personId),
      this.contactRequestRepo.countResolvedOutgoingForSender(personId),
      this.intentcastRepo.countBulletinResponseNotificationsForAuthor(personId),
      this.connectionThreadRepo.countThreadNotificationRowsForRecipient(personId),
      this.citiesRepo.countOfferNotifications(personId),
      this.announcements ? this.announcements.countNotificationsForPerson(personId) : Promise.resolve(0)
    ]);
    return (
      pending +
      resolvedOut +
      bulletin +
      threadReplies +
      Math.min(cityOffers, CITY_OFFER_LIMIT) +
      Math.min(announcements, ANNOUNCEMENT_LIMIT)
    );
  }
}
