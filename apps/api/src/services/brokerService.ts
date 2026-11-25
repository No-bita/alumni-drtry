import type { Pool, PoolClient } from "pg";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import {
  EXPERIENCE_BAND_LABELS,
  JOB_FUNCTION_LABELS,
  experienceBandForBatchYear,
  type ExperienceBand,
  type JobFunction
} from "../lib/jobFunctions.js";
import { composeNoteMessage, NoteDetailsError, validateNoteDetails, type NoteInput, type ReferralDetails } from "../lib/noteDetails.js";
import { webAppUrl } from "../lib/webAppUrl.js";
import { isViewAsRequest } from "../lib/viewAsContext.js";
import {
  BrokerRepo,
  type AskerRequestView,
  type BrokerKind,
  type BrokerRequestRow,
  type HelperAskView
} from "../repos/brokerRepo.js";
import { BrokerConversationRepo } from "../repos/brokerConversationRepo.js";
import { IntentcastRepo } from "../repos/intentcastRepo.js";
import type { BrokerEmailPayload, EmailSender } from "./emailSender.js";

/** How long a request stays open (approved: 2 days). */
export const BROKER_REQUEST_OPEN_HOURS = 48;
/** Most referral requests one member can have open at once. */
export const BROKER_OPEN_REFERRALS_MAX = 3;
/** Company suggestions for the referral flow. */
export const BROKER_COMPANIES_MAX = 200;
const LIST_LIMIT = 50;
const EXPIRE_BATCH = 500;

export const BROKER_WHATSAPP_SETTING = "broker_whatsapp";

/** Another way to put an ask in front of a helper (WhatsApp, behind the admin switch). */
export interface BrokerAskChannel {
  trySendBrokerAsk(input: {
    askId: string;
    helperPersonId: string;
    askerName: string;
    askerBatchYear: number | null;
    message: string;
  }): Promise<boolean>;
}

export interface CreateReferralRequestInput {
  jobFunction: JobFunction;
  /** The referral note form: role, company, job link, why you're a fit, optional résumé. */
  note: NoteInput;
}

/** Ask's "Ask them privately if they're interested" (no Wall post). Lengths are checked by the route. */
export interface PrivateHiringInput {
  jobFunction: JobFunction;
  experience: ExperienceBand;
  roleTitle: string | null;
  company: string | null;
  message: string;
}

export interface RespondResult {
  status: "connected" | "declined";
  /** Once connected: the request, whose conversation the two of them now share. No contact is shared. */
  requestId: string | null;
  askerName: string | null;
}

function firstName(full: string | null | undefined): string {
  return (full ?? "").trim().split(/\s+/)[0] || "there";
}

function hiringHeadline(r: Pick<BrokerRequestRow, "role_title" | "job_function" | "experience_band" | "company">): string {
  const fn = JOB_FUNCTION_LABELS[r.job_function as JobFunction] ?? "Role";
  const role = r.role_title?.trim() || `${fn} role`;
  const exp = r.experience_band ? EXPERIENCE_BAND_LABELS[r.experience_band as ExperienceBand] : null;
  return [role, r.company, exp].filter(Boolean).join(" · ");
}

/** The one-line ask a helper reads (email, WhatsApp). */
export function helperAskLine(kind: BrokerKind, askerName: string, r: Pick<BrokerRequestRow, "role_title" | "job_function" | "experience_band" | "company">): string {
  if (kind === "referral") {
    return `${askerName} is looking for a referral at ${r.company}${r.role_title ? ` for ${r.role_title}` : ""}. You're there now, so Alma Mater asked you.`;
  }
  return `${askerName} is hiring: ${hiringHeadline(r)}. Your profile matches, so Alma Mater asked whether you're interested.`;
}

/**
 * Brokered requests (approved): the member says what they need once; we ask every eligible alum on
 * their behalf, the first yes connects them (an accepted reachout), and everyone else asked is told
 * it's taken care of. Declines are never shown to the asker. Requests close after 2 days.
 */
export class BrokerService {
  private readonly repo: BrokerRepo;
  private readonly intentcasts: IntentcastRepo;
  private channel: BrokerAskChannel | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly emailSender: EmailSender
  ) {
    this.repo = new BrokerRepo(pool);
    this.intentcasts = new IntentcastRepo(pool);
  }

  /** Wire WhatsApp in after construction (it calls back into this service for button replies). */
  setAskChannel(channel: BrokerAskChannel | null): void {
    this.channel = channel;
  }

  /* ------------------------------ settings ------------------------------ */

  async whatsappEnabled(): Promise<boolean> {
    return (await this.repo.getSetting(BROKER_WHATSAPP_SETTING)) === true;
  }

  async setWhatsappEnabled(enabled: boolean, actorPersonId: string): Promise<boolean> {
    await this.repo.setSetting(BROKER_WHATSAPP_SETTING, enabled, actorPersonId);
    return enabled;
  }

  /* ------------------------------ asker side ------------------------------ */

  async referralCompanies(askerPersonId: string, askerIsDemo: boolean) {
    return this.repo.referralCompanies(askerPersonId, askerIsDemo, BROKER_COMPANIES_MAX);
  }

  /** How many alumni would be asked for a referral at this company (told before sending). */
  async referralEligible(askerPersonId: string, askerIsDemo: boolean, company: string): Promise<{ company: string; count: number }> {
    const found = await this.repo.referralHelpers(company, askerPersonId, askerIsDemo);
    return { company: found.company ?? company.trim(), count: found.helperIds.length };
  }

  async hiringEligible(askerPersonId: string, askerIsDemo: boolean, jobFunction: JobFunction, band: ExperienceBand): Promise<{ count: number }> {
    return { count: (await this.repo.hiringHelpers(jobFunction, band, askerPersonId, askerIsDemo)).length };
  }

  async createReferralRequest(askerPersonId: string, askerIsDemo: boolean, input: CreateReferralRequestInput): Promise<AskerRequestView> {
    let details: ReferralDetails;
    try {
      const d = validateNoteDetails({ ...input.note, purpose: "referral" });
      if (d.purpose !== "referral") throw new NoteDetailsError("CONTACT_REQUEST_PURPOSE_REQUIRED", "This is a referral request.");
      details = d;
    } catch (err) {
      if (err instanceof NoteDetailsError) throw new AppError(400, err.code, err.message);
      throw err;
    }

    const open = await this.repo.openReferralRequests(askerPersonId);
    if (open.some((r) => r.company.toLowerCase() === details.company.toLowerCase())) {
      throw new AppError(409, "BROKER_DUPLICATE_OPEN", `You already have a referral request open for ${details.company}.`);
    }
    if (open.length >= BROKER_OPEN_REFERRALS_MAX) {
      throw new AppError(429, "BROKER_TOO_MANY_OPEN", `You have ${BROKER_OPEN_REFERRALS_MAX} referral requests open. Send more once they close.`);
    }

    const found = await this.repo.referralHelpers(details.company, askerPersonId, askerIsDemo);
    if (found.helperIds.length === 0) {
      throw new AppError(422, "BROKER_NO_ALUMNI", `No alumni at ${details.company} on Alma Mater yet.`);
    }
    const asker = await this.repo.person(askerPersonId);
    if (!asker) throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found.");
    const company = found.company ?? details.company;
    const created = await this.inTransaction((repo) =>
      repo.createWithAsks({
        kind: "referral",
        askerPersonId,
        intentcastId: null,
        company,
        jobFunction: input.jobFunction,
        experienceBand: experienceBandForBatchYear(asker.batch_year),
        roleTitle: details.role,
        jobUrl: details.jobUrl,
        message: composeNoteMessage({ ...details, company }),
        details: { ...details, company },
        expiresAt: new Date(Date.now() + BROKER_REQUEST_OPEN_HOURS * 3_600_000),
        helperIds: found.helperIds
      })
    );
    await this.deliver(created.request, created.asks, asker);
    return this.requestView(askerPersonId, created.request.id);
  }

  /** Hiring (optional): also ask matching alumni privately, from the poster's own hiring post. */
  async createHiringRequest(askerPersonId: string, askerIsDemo: boolean, intentcastId: string): Promise<AskerRequestView> {
    const post = await this.intentcasts.findFeedItemById(intentcastId, askerPersonId);
    if (!post || post.authorPersonId !== askerPersonId) {
      throw new AppError(404, "INTENTCAST_NOT_FOUND", "Post not found.");
    }
    if (post.category !== "hiring" || !post.hiring) {
      throw new AppError(400, "BROKER_NOT_A_HIRING_POST", "Only a hiring post can ask alumni privately.");
    }
    if (post.status !== "open" || post.authorSoftDeletedAt) {
      throw new AppError(409, "BROKER_POST_CLOSED", "This post is closed.");
    }
    if (await this.repo.requestForIntentcast(intentcastId)) {
      throw new AppError(409, "BROKER_DUPLICATE_OPEN", "Alumni were already asked for this post.");
    }
    const h = post.hiring;
    const helperIds = await this.repo.hiringHelpers(h.jobFunction, h.experience, askerPersonId, askerIsDemo);
    if (helperIds.length === 0) {
      throw new AppError(
        422,
        "BROKER_NO_MATCHES",
        `No alumni match ${JOB_FUNCTION_LABELS[h.jobFunction]} · ${EXPERIENCE_BAND_LABELS[h.experience]} yet. Your post is still on the Wall.`
      );
    }
    const asker = await this.repo.person(askerPersonId);
    if (!asker) throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found.");
    const company = h.company?.trim() || post.authorCurrentOrganizationName?.trim() || "their company";
    const created = await this.inTransaction((repo) =>
      repo.createWithAsks({
        kind: "hiring",
        askerPersonId,
        intentcastId,
        company,
        jobFunction: h.jobFunction,
        experienceBand: h.experience,
        roleTitle: h.roleTitle,
        jobUrl: h.applyUrl,
        message: post.content,
        details: null,
        expiresAt: new Date(Date.now() + BROKER_REQUEST_OPEN_HOURS * 3_600_000),
        helperIds
      })
    ).catch((err: unknown) => {
      if ((err as { code?: string })?.code === "23505") {
        throw new AppError(409, "BROKER_DUPLICATE_OPEN", "Alumni were already asked for this post.");
      }
      throw err;
    });
    await this.deliver(created.request, created.asks, asker);
    return this.requestView(askerPersonId, created.request.id);
  }

  /**
   * Hiring from Ask's Find candidates: ask matching alumni privately, with no Wall post (approved).
   * No cap on how many are open; just not two open for the same function and experience level.
   */
  async createPrivateHiringRequest(askerPersonId: string, askerIsDemo: boolean, input: PrivateHiringInput): Promise<AskerRequestView> {
    const roleTitle = input.roleTitle?.replace(/\s+/g, " ").trim() || null;
    const message = input.message.trim();
    const open = await this.repo.openPrivateHiringRequests(askerPersonId);
    if (open.some((r) => r.job_function === input.jobFunction && r.experience_band === input.experience)) {
      throw new AppError(
        409,
        "BROKER_DUPLICATE_OPEN",
        `You already have a private ask open for ${JOB_FUNCTION_LABELS[input.jobFunction]} · ${EXPERIENCE_BAND_LABELS[input.experience]}.`
      );
    }
    const helperIds = await this.repo.hiringHelpers(input.jobFunction, input.experience, askerPersonId, askerIsDemo);
    if (helperIds.length === 0) {
      throw new AppError(
        422,
        "BROKER_NO_MATCHES",
        `No alumni match ${JOB_FUNCTION_LABELS[input.jobFunction]} · ${EXPERIENCE_BAND_LABELS[input.experience]} yet.`
      );
    }
    const asker = await this.repo.person(askerPersonId);
    if (!asker) throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found.");
    const company = input.company?.replace(/\s+/g, " ").trim() || "their company";
    const created = await this.inTransaction((repo) =>
      repo.createWithAsks({
        kind: "hiring",
        askerPersonId,
        intentcastId: null,
        company,
        jobFunction: input.jobFunction,
        experienceBand: input.experience,
        roleTitle,
        jobUrl: null,
        message,
        details: null,
        expiresAt: new Date(Date.now() + BROKER_REQUEST_OPEN_HOURS * 3_600_000),
        helperIds
      })
    );
    await this.deliver(created.request, created.asks, asker);
    return this.requestView(askerPersonId, created.request.id);
  }

  async listMine(askerPersonId: string): Promise<AskerRequestView[]> {
    await this.expireDue();
    return this.repo.listForAsker(askerPersonId, LIST_LIMIT);
  }

  private async requestView(askerPersonId: string, requestId: string): Promise<AskerRequestView> {
    const mine = await this.repo.listForAsker(askerPersonId, LIST_LIMIT);
    const view = mine.find((r) => r.id === requestId);
    if (!view) throw new AppError(500, "BROKER_CREATE_FAILED", "Could not load the request.");
    return view;
  }

  /* ------------------------------ helper side ------------------------------ */

  async listForHelper(helperPersonId: string): Promise<HelperAskView[]> {
    await this.expireDue();
    return this.repo.listForHelper(helperPersonId, LIST_LIMIT);
  }

  /** The helper opened the ask in the app. The asker hears the first time anyone sees it. */
  async markSeen(helperPersonId: string, askId: string): Promise<void> {
    const { firstForRequest } = await this.repo.markSeen(askId, helperPersonId);
    if (!firstForRequest) return;
    const asker = await this.repo.person(firstForRequest.asker_person_id);
    if (!asker) return;
    await this.email({
      to: asker.institutional_email,
      event: "asker_seen",
      subject: "Someone has seen your request",
      greetingName: firstName(asker.full_name),
      paragraphs: [
        firstForRequest.kind === "referral"
          ? `An alum at ${firstForRequest.company} has seen your referral request. We'll tell you as soon as someone says yes.`
          : `A matching alum has seen your hiring post. We'll tell you as soon as someone is interested.`
      ],
      ctaLabel: "See your request",
      ctaUrl: `${webAppUrl()}/notifications`
    });
  }

  /**
   * "Yes" or "Not this time". The first yes connects: a private conversation between the asker and the
   * helper, tied to the request (no contact is shared). Asks answered after that are told it's taken care of.
   */
  async respond(helperPersonId: string, askId: string, action: "accept" | "decline"): Promise<RespondResult> {
    await this.expireDue();
    const outcome = await this.inTransaction(async (repo, client) => {
      const ask = await repo.askForResponse(askId, true);
      if (!ask || ask.helper_person_id !== helperPersonId) {
        throw new AppError(404, "BROKER_ASK_NOT_FOUND", "Request not found.");
      }
      if (ask.ask_status === "withdrawn" || ask.request_status !== "open" || ask.expires_at.getTime() <= Date.now()) {
        throw ask.request_status === "connected"
          ? new AppError(409, "BROKER_ALREADY_HELPED", "Someone already helped with this one. Thank you!")
          : new AppError(409, "BROKER_REQUEST_CLOSED", "This request has closed.");
      }
      if (ask.ask_status !== "asked") {
        throw new AppError(409, "BROKER_ALREADY_ANSWERED", "You've already answered this request.");
      }
      if (action === "decline") {
        await repo.setAskAnswer(askId, "declined");
        return { status: "declined" as const };
      }
      const request = (await repo.request(ask.request_id))!;
      const [asker, helper] = await Promise.all([repo.person(request.asker_person_id), repo.person(helperPersonId)]);
      if (!asker || !helper) throw new AppError(404, "BROKER_ASK_NOT_FOUND", "Request not found.");
      await repo.setAskAnswer(askId, "accepted");
      const contactRequestId = await repo.insertAcceptedReachout({
        askerPersonId: asker.id,
        helperPersonId: helper.id,
        helperInstitutionalEmail: helper.institutional_email,
        message: request.message,
        details: request.details,
        source: request.kind === "referral" ? "referral_request" : "hiring_request",
        sourceCategory: request.kind === "referral" ? "referral" : "hiring"
      });
      if (!(await repo.markConnected(request.id, contactRequestId))) {
        throw new AppError(409, "BROKER_ALREADY_HELPED", "Someone already helped with this one. Thank you!");
      }
      await repo.withdrawOthers(request.id, askId);
      await new BrokerConversationRepo(client).create(request.id, asker.id, helper.id);
      return { status: "connected" as const, request, asker, helper };
    });

    if (outcome.status === "declined") return { status: "declined", requestId: null, askerName: null };

    const { request, asker, helper } = outcome;
    const conversationUrl = `${webAppUrl()}/requests/${request.id}/conversation`;
    const helperName = helper.full_name?.trim() || "An alum";
    const askerName = asker.full_name?.trim() || "The member";
    await this.email({
      to: asker.institutional_email,
      event: "asker_connected",
      subject: request.kind === "referral" ? `${helperName} can refer you at ${request.company}` : `${helperName} is interested in your role`,
      greetingName: firstName(asker.full_name),
      paragraphs: [
        request.kind === "referral"
          ? `${helperName} at ${request.company} said yes to your referral request.`
          : `${helperName} said they're interested in your hiring post (${hiringHeadline(request)}).`,
        "Message them on Alma Mater. Contact details stay private unless one of you shares them."
      ],
      ctaLabel: "Open the conversation",
      ctaUrl: conversationUrl
    });
    await this.email({
      to: helper.institutional_email,
      event: "helper_connected",
      subject: `You're connected with ${askerName}`,
      greetingName: firstName(helper.full_name),
      paragraphs: [`Thanks for saying yes. We've told ${askerName}. Message each other on Alma Mater; contact details stay private unless one of you shares them.`],
      ctaLabel: "Open the conversation",
      ctaUrl: conversationUrl
    });
    return { status: "connected", requestId: request.id, askerName };
  }

  /* ------------------------------ closing ------------------------------ */

  /** Closes requests past their 2 days (nobody said yes) and tells each asker. Safe to run often. */
  async expireDue(): Promise<number> {
    // Admin viewing as a member (read-only): don't close requests or email askers from their reads; the hourly job does it.
    if (isViewAsRequest()) return 0;
    const closed = await this.repo.expireDue(EXPIRE_BATCH);
    if (closed.length === 0) return 0;
    const askers = new Map((await this.repo.people([...new Set(closed.map((r) => r.asker_person_id))])).map((p) => [p.id, p]));
    for (const r of closed) {
      const asker = askers.get(r.asker_person_id);
      if (!asker) continue;
      await this.email({
        to: asker.institutional_email,
        event: "asker_expired",
        subject: "No one was available this time",
        greetingName: firstName(asker.full_name),
        paragraphs: [
          r.kind === "referral"
            ? `We asked ${r.asked_count} alumni at ${r.company}, and no one was able to refer you in the last 2 days. That says nothing about you: people are busy. You could try a related company.`
            : `We asked ${r.asked_count} matching alumni about your role, and no one said they were interested in the last 2 days. Your post stays on the Wall until it ends.`
        ],
        ctaLabel: "Open Alma Mater",
        ctaUrl: `${webAppUrl()}/notifications`
      });
    }
    return closed.length;
  }

  /* ------------------------------ delivery ------------------------------ */

  private async deliver(
    request: BrokerRequestRow,
    asks: Array<{ id: string; helper_person_id: string }>,
    asker: { id: string; full_name: string | null; institutional_email: string; batch_year: number | null }
  ): Promise<void> {
    const askerName = asker.full_name?.trim() || "An alum";
    const line = helperAskLine(request.kind, askerName, request);

    // WhatsApp only when an admin has turned it on (and the helper opted in to WhatsApp notes).
    if (this.channel && asks.length > 0 && (await this.whatsappEnabled())) {
      for (const ask of asks) {
        try {
          const sent = await this.channel.trySendBrokerAsk({
            askId: ask.id,
            helperPersonId: ask.helper_person_id,
            askerName,
            askerBatchYear: asker.batch_year,
            message: `${line}\n\n${request.message}`
          });
          if (sent) await this.repo.setDeliveryChannel(ask.id, "whatsapp");
        } catch (err) {
          console.error("[broker] WhatsApp ask failed (still in the app):", err);
        }
      }
    }

    if (env.BROKER_EMAILS_ENABLED) {
      const helpers = await this.repo.people(asks.map((a) => a.helper_person_id));
      for (const h of helpers) {
        await this.email({
          to: h.institutional_email,
          event: "helper_asked",
          subject: request.kind === "referral" ? `Can you refer ${firstName(askerName)} at ${request.company}?` : `${firstName(askerName)} is hiring: are you interested?`,
          greetingName: firstName(h.full_name),
          paragraphs: [line, "Say yes and we'll connect you. Not this time? No one is told."],
          ctaLabel: "Answer in Alma Mater",
          ctaUrl: `${webAppUrl()}/notifications`
        });
      }
    }
    await this.email({
      to: asker.institutional_email,
      event: "asker_sent",
      subject: "We've sent your request",
      greetingName: firstName(asker.full_name),
      paragraphs: [
        request.kind === "referral"
          ? `We've asked ${asks.length} alumni at ${request.company} on your behalf. We'll tell you when someone says yes, within 2 days.`
          : `We've asked ${asks.length} matching alumni whether they're interested in your role. We'll tell you when someone says yes, within 2 days.`
      ],
      ctaLabel: "Track your request",
      ctaUrl: `${webAppUrl()}/notifications`
    });
  }

  /** Every broker email goes through here: off while automatic emails are paused (BROKER_EMAILS_ENABLED). */
  private async email(payload: BrokerEmailPayload): Promise<void> {
    if (!env.BROKER_EMAILS_ENABLED) return;
    try {
      await this.emailSender.sendBrokerEmail(payload);
    } catch (err) {
      console.error(`[broker] ${payload.event} email failed (the app still shows it):`, err);
    }
  }

  private async inTransaction<T>(work: (repo: BrokerRepo, client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const out = await work(new BrokerRepo(client), client);
      await client.query("COMMIT");
      return out;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
