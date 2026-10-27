import { env } from "../config/env.js";

/**
 * Minimal Meta WhatsApp Cloud API client (Graph API): plain text, reply buttons, a link button,
 * and approved templates. No message text is logged anywhere; the caller records metadata only.
 */
export type ReplyButton = { id: string; title: string };

export type OutboundMessage =
  | { kind: "text"; body: string }
  | { kind: "buttons"; body: string; buttons: ReplyButton[] }
  | { kind: "link"; body: string; label: string; url: string }
  | {
      kind: "template";
      name: string;
      language: string;
      bodyParams: string[];
      /** Payloads for the template's quick-reply buttons, in order. */
      buttonPayloads: string[];
      /** Echoed back by Meta in status updates (biz_opaque_callback_data), e.g. "cr:<note id>". */
      callbackData?: string;
    };

/** Meta answered and said no (4xx): the message was definitely not sent. */
export class WhatsAppRejectedError extends Error {}

/** Anything else (timeout, network, Meta 5xx) means we can't tell whether it went out. */
export const isDefiniteRejection = (err: unknown): boolean => err instanceof WhatsAppRejectedError;

export interface WhatsAppSender {
  /** Returns Meta's message id. Throws on any failure. */
  send(to: string, message: OutboundMessage): Promise<string>;
}

/** Meta limits: reply-button titles 20 chars, body 1024 chars, at most 3 buttons. */
const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

export function toGraphPayload(to: string, m: OutboundMessage): Record<string, unknown> {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  switch (m.kind) {
    case "text":
      return { ...base, type: "text", text: { body: clip(m.body, 4096), preview_url: false } };
    case "buttons":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: clip(m.body, 1024) },
          action: {
            buttons: m.buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: clip(b.title, 20) } }))
          }
        }
      };
    case "link":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "cta_url",
          body: { text: clip(m.body, 1024) },
          action: { name: "cta_url", parameters: { display_text: clip(m.label, 20), url: m.url } }
        }
      };
    case "template":
      return {
        ...base,
        type: "template",
        ...(m.callbackData ? { biz_opaque_callback_data: m.callbackData.slice(0, 512) } : {}),
        template: {
          name: m.name,
          language: { code: m.language },
          components: [
            { type: "body", parameters: m.bodyParams.map((text) => ({ type: "text", text: clip(text, 1000) })) },
            ...m.buttonPayloads.map((payload, index) => ({
              type: "button",
              sub_type: "quick_reply",
              index: String(index),
              parameters: [{ type: "payload", payload }]
            }))
          ]
        }
      };
  }
}

export class CloudApiSender implements WhatsAppSender {
  async send(to: string, message: OutboundMessage): Promise<string> {
    const url = `https://graph.facebook.com/${env.WA_GRAPH_VERSION}/${env.WA_PHONE_NUMBER_ID}/messages`;
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(toGraphPayload(to, message))
    });
    const body = (await res.json().catch(() => ({}))) as { messages?: Array<{ id?: string }>; error?: { code?: number; message?: string } };
    if (!res.ok || !body.messages?.[0]?.id) {
      const detail = `WhatsApp send failed (${res.status}): ${body.error?.code ?? ""} ${body.error?.message ?? ""}`.trim();
      throw res.status >= 400 && res.status < 500 ? new WhatsAppRejectedError(detail) : new Error(detail);
    }
    return body.messages[0].id;
  }
}

/** Used when WhatsApp is off, and in tests: records messages instead of sending them. */
export class RecordingSender implements WhatsAppSender {
  readonly sent: Array<{ to: string; message: OutboundMessage; id: string }> = [];
  private n = 0;
  private readonly prefix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  async send(to: string, message: OutboundMessage): Promise<string> {
    this.n += 1;
    const id = `wamid.test.${this.prefix}.${this.n}`;
    this.sent.push({ to, message, id });
    return id;
  }
}
