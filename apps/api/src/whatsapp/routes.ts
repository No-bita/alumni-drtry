import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.js";
import { verifyWebhookSignature } from "./linkToken.js";
import type { ClaimResult } from "./repo.js";
import type { WebhookPayload, WhatsAppService } from "./service.js";

export type WhatsAppRouteOptions = {
  service: WhatsAppService;
  enabled: boolean;
  appSecret: string | undefined;
  verifyToken: string | undefined;
};

/** `token`: a short link code (8 letters/digits) or a full signed link. */
const linkSchema = z.object({ token: z.string().min(8).max(2000) });
const settingsSchema = z
  .object({ notesOptedIn: z.boolean().optional(), notesPaused: z.boolean().optional() })
  .strict();

const LINK_MESSAGES = {
  invalid: "This WhatsApp link has expired. Text hi to the bot for a new one."
};

const LINK_REFUSALS: Record<Exclude<ClaimResult, "linked" | "already_yours">, { code: string; message: string }> = {
  linked_elsewhere: {
    code: "WHATSAPP_NUMBER_TAKEN",
    message: "This link was sent to another member's WhatsApp, so it can't be linked to your account."
  },
  you_have_another: {
    code: "WHATSAPP_ALREADY_LINKED",
    message: "Your account is already linked to a different WhatsApp number. Text hi from that number."
  },
  used: { code: "WHATSAPP_LINK_USED", message: "This link was already used. Text hi to the bot for a new one." }
};

/** Meta webhook (raw body for the signature check). Kept in its own scope so other routes keep the normal JSON parser. */
const webhookRoutes: FastifyPluginAsync<WhatsAppRouteOptions> = async (app, opts) => {
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    (request as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString("utf8") || "{}"));
    } catch {
      done(new AppError(400, "WHATSAPP_BAD_PAYLOAD", "Invalid JSON."), undefined);
    }
  });

  /** One-time verification when the webhook is registered in Meta's dashboard. */
  app.get("/v1/whatsapp/webhook", async (request, reply) => {
    if (!opts.enabled) return reply.code(404).send();
    const q = request.query as Record<string, string | undefined>;
    if (q["hub.mode"] === "subscribe" && opts.verifyToken && q["hub.verify_token"] === opts.verifyToken) {
      return reply.code(200).type("text/plain").send(q["hub.challenge"] ?? "");
    }
    return reply.code(403).send();
  });

  /** Messages and delivery statuses. Answers 200 at once (Meta retries slow replies), then processes. */
  app.post("/v1/whatsapp/webhook", async (request, reply) => {
    if (!opts.enabled || !opts.appSecret) return reply.code(404).send();
    const raw = (request as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from("");
    const signature = request.headers["x-hub-signature-256"];
    if (!verifyWebhookSignature(raw, Array.isArray(signature) ? signature[0] : signature, opts.appSecret)) {
      return reply.code(403).send();
    }
    reply.code(200).send();
    await opts.service.handleWebhook(request.body as WebhookPayload).catch((err: unknown) => {
      request.log.error({ err }, "whatsapp webhook processing failed");
    });
    return reply;
  });
};

/** Member settings + linking a number from the website. */
const memberRoutes: FastifyPluginAsync<WhatsAppRouteOptions> = async (app, opts) => {
  app.get("/v1/me/whatsapp", { preHandler: app.authenticate }, async (request, reply) => {
    return reply.code(200).send({ whatsapp: await opts.service.settingsFor(request.actor.personId) });
  });

  app.patch(
    "/v1/me/whatsapp",
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
    async (request, reply) => {
      const parsed = settingsSchema.safeParse(request.body);
      if (!parsed.success) throw new AppError(400, "WHATSAPP_BAD_REQUEST", "Invalid WhatsApp settings.");
      await opts.service.updateSettings(request.actor.personId, parsed.data);
      return reply.code(200).send({ whatsapp: await opts.service.settingsFor(request.actor.personId) });
    }
  );

  /** Before linking: what the bot's link would do for this member, and the number's last 4 digits. */
  app.post(
    "/v1/me/whatsapp-link/check",
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
    async (request, reply) => {
      const parsed = linkSchema.safeParse(request.body);
      const result = parsed.success ? await opts.service.checkLink(request.actor.personId, parsed.data.token) : null;
      if (!result) throw new AppError(400, "WHATSAPP_LINK_INVALID", LINK_MESSAGES.invalid);
      return reply.code(200).send({ link: result });
    }
  );

  /** The member confirmed: link the number in the bot's link (once per link; numbers never move). */
  app.post(
    "/v1/me/whatsapp-link",
    { preHandler: [app.authenticate, app.requireNonDemoMutation] },
    async (request, reply) => {
      const parsed = linkSchema.safeParse(request.body);
      const status = parsed.success ? await opts.service.claimLink(request.actor.personId, parsed.data.token) : null;
      if (!status) throw new AppError(400, "WHATSAPP_LINK_INVALID", LINK_MESSAGES.invalid);
      if (status !== "linked" && status !== "already_yours") {
        const refusal = LINK_REFUSALS[status];
        throw new AppError(409, refusal.code, refusal.message);
      }
      return reply.code(200).send({ whatsapp: await opts.service.settingsFor(request.actor.personId) });
    }
  );
};

export const whatsappRoutes: FastifyPluginAsync<WhatsAppRouteOptions> = async (app, opts) => {
  await app.register(webhookRoutes, opts);
  await app.register(memberRoutes, opts);
};
