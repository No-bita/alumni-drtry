import type { Pool } from "pg";
import { ConnectionThreadRepo } from "../repos/connectionThreadRepo.js";
import { ContactRequestRepo } from "../repos/contactRequestRepo.js";
import { CitiesRepo } from "../repos/citiesRepo.js";
import { IntentcastRepo } from "../repos/intentcastRepo.js";

const POST_PREVIEW_MAX = 160;
const THREAD_PREVIEW_MAX = 140;
const OUTGOING_RESOLVED_LIMIT = 1000;
const BULLETIN_RESPONSE_LIMIT = 1000;
const CITY_OFFER_LIMIT = 200;

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
      contactRequestId: string;
      senderPersonId: string;
      senderFullName: string | null;
      message: string;
      /** Where the note came from and its category (e.g. "cities" + "coffee"), for wording. */
      source: string | null;
      sourceCategory: string | null;
    }
  | {
      /** Cities v1: a local offered to help the newcomer settle in (in-app only, never a message). */
      kind: "city_help_offer_received";
      id: string;
      occurredAt: string;
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
      contactRequestId: string;
      outcome: "accepted" | "declined";
      recipientPersonId: string;
      recipientFullName: string | null;
    }
  | {
      kind: "bulletin_response";
      id: string;
      occurredAt: string;
      responseId: string;
      intentcastId: string;
      postPreview: string;
      responderPersonId: string;
      responderFullName: string;
      responseMessage: string;
    }
  | {
      kind: "connection_thread_reply";
      id: string;
      occurredAt: string;
      threadId: string;
      counterpartyPersonId: string;
      counterpartyFullName: string | null;
      lastMessagePreview: string;
    };

export class NotificationService {
  private readonly contactRequestRepo: ContactRequestRepo;
  private readonly connectionThreadRepo: ConnectionThreadRepo;
  private readonly intentcastRepo: IntentcastRepo;
  private readonly citiesRepo: CitiesRepo;

  constructor(pool: Pool) {
    this.citiesRepo = new CitiesRepo(pool);
    this.contactRequestRepo = new ContactRequestRepo(pool);
    this.connectionThreadRepo = new ConnectionThreadRepo(pool);
    this.intentcastRepo = new IntentcastRepo(pool);
  }

  async listForPerson(personId: string): Promise<NotificationItemDto[]> {
    const [pendingIncoming, resolvedOutgoing, bulletinResponses, threadReplies, cityOffers] = await Promise.all([
      this.contactRequestRepo.listPendingIncomingForRecipient(personId),
      this.contactRequestRepo.listResolvedOutgoingForSender(personId, OUTGOING_RESOLVED_LIMIT),
      this.intentcastRepo.listBulletinResponseNotificationsForAuthor(personId, BULLETIN_RESPONSE_LIMIT),
      this.connectionThreadRepo.listThreadNotificationRowsForRecipient(personId, 50),
      this.citiesRepo.offerNotifications(personId, CITY_OFFER_LIMIT)
    ]);

    const items: NotificationItemDto[] = [];

    for (const p of pendingIncoming) {
      items.push({
        kind: "contact_request_received",
        id: `cr-in:${p.id}`,
        occurredAt: p.createdAt.toISOString(),
        contactRequestId: p.id,
        senderPersonId: p.senderPersonId,
        senderFullName: p.senderFullName,
        message: p.message,
        source: p.source,
        sourceCategory: p.sourceCategory
      });
    }

    for (const o of cityOffers) {
      items.push({
        kind: "city_help_offer_received",
        id: `city-offer:${o.offer_id}`,
        occurredAt: o.created_at.toISOString(),
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
        threadId: tr.threadId,
        counterpartyPersonId: tr.counterpartyPersonId,
        counterpartyFullName: tr.counterpartyFullName,
        lastMessagePreview: truncatePreview(tr.lastBody, THREAD_PREVIEW_MAX)
      });
    }

    items.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
    return items;
  }

  /** Total notification rows (matches aggregation behind GET /v1/notifications, without row limits). */
  async countForPerson(personId: string): Promise<number> {
    const [pending, resolvedOut, bulletin, threadReplies, cityOffers] = await Promise.all([
      this.contactRequestRepo.countPendingIncomingForRecipient(personId),
      this.contactRequestRepo.countResolvedOutgoingForSender(personId),
      this.intentcastRepo.countBulletinResponseNotificationsForAuthor(personId),
      this.connectionThreadRepo.countThreadNotificationRowsForRecipient(personId),
      this.citiesRepo.countOfferNotifications(personId)
    ]);
    return pending + resolvedOut + bulletin + threadReplies + Math.min(cityOffers, CITY_OFFER_LIMIT);
  }
}
