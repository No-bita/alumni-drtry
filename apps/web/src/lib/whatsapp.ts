import { api } from "../api/client";
import { assertApiGet } from "./assertApiGet";

/** GET /v1/me/whatsapp */
export type WhatsAppSettings = {
  linked: boolean;
  /** Last 4 digits of the linked number. */
  numberHint: string | null;
  notesOptedIn: boolean;
  notesPaused: boolean;
  stopped: boolean;
  /** The bot's number (digits, no "+"), when configured. */
  botNumber: string | null;
};

export const WHATSAPP_SETTINGS_KEY = ["me", "whatsapp"] as const;

export async function fetchWhatsAppSettings(signal: AbortSignal): Promise<WhatsAppSettings> {
  return (await assertApiGet<{ whatsapp: WhatsAppSettings }>("/v1/me/whatsapp", signal)).whatsapp;
}

export async function updateWhatsAppSettings(patch: { notesOptedIn?: boolean; notesPaused?: boolean }): Promise<WhatsAppSettings> {
  const { data, error } = await api.patch<{ whatsapp: WhatsAppSettings }>("/v1/me/whatsapp", patch);
  if (error || !data) throw new Error(error?.message ?? "Couldn't save.");
  return data.whatsapp;
}

export const whatsappChatUrl = (botNumber: string) => `https://wa.me/${botNumber}`;

/* ---------- Entry links from the bot: /wa?t=<signed token>&next=<path> ---------- */

const KEY = "alma.waEntry";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Pending = { t: string; next: string | null; at: number };

/** Only same-site paths: "/match?…" yes; "//evil.com" or "https://…" no. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return next;
}

export function rememberWhatsAppEntry(t: string, next: string | null, now = Date.now()): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ t, next: safeNext(next), at: now } satisfies Pending));
  } catch {
    /* storage blocked: the link still works if they're already signed in */
  }
}

export function pendingWhatsAppEntry(now = Date.now()): Pending | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pending;
    if (!p?.t || now - p.at > MAX_AGE_MS) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return { t: p.t, next: safeNext(p.next), at: p.at };
  } catch {
    return null;
  }
}

export function clearWhatsAppEntry(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** What the bot's link would do for the signed-in member (POST /v1/me/whatsapp-link/check). */
export type WhatsAppLinkStatus = "ready" | "already_yours" | "linked_elsewhere" | "you_have_another" | "used";
/** `next`: where a short link (/w/<code>) leads; null for full links, which carry it themselves. */
export type WhatsAppLinkCheck = { status: WhatsAppLinkStatus; numberHint: string; next?: string | null };

const EXPIRED = "This WhatsApp link has expired. Text hi to the bot for a new one.";

/** Before asking "Link WhatsApp ending 3210?". Returns the check, or an error message. */
export async function checkWhatsAppLink(token: string): Promise<{ check: WhatsAppLinkCheck } | { error: string }> {
  const { data, error } = await api.post<{ link: WhatsAppLinkCheck }>("/v1/me/whatsapp-link/check", { token });
  if (error || !data) return { error: error?.message ?? EXPIRED };
  return { check: data.link };
}

/** The member said yes: link the number. Returns an error message, or null when linked. */
export async function claimWhatsAppLink(token: string): Promise<string | null> {
  const { error } = await api.post<{ whatsapp: WhatsAppSettings }>("/v1/me/whatsapp-link", { token });
  if (!error) return null;
  return error.message ?? "This WhatsApp link didn't work. Text hi to the bot for a new one.";
}

/** Messages for links that can't link anything for this member (same wording as the API). */
export const WHATSAPP_LINK_REFUSALS: Record<Exclude<WhatsAppLinkStatus, "ready" | "already_yours">, string> = {
  linked_elsewhere: "This link was sent to another member's WhatsApp, so it can't be linked to your account.",
  you_have_another: "Your account is already linked to a different WhatsApp number. Text hi from that number.",
  used: "This link was already used. Text hi to the bot for a new one.",
};

/** For POST /v1/auth/start: carries the bot link through the sign-in email. */
export function whatsappEntryForSignIn(): { token: string; next: string | null } | undefined {
  const p = pendingWhatsAppEntry();
  return p ? { token: p.t, next: p.next } : undefined;
}

/** A contact an alum shared: WhatsApp numbers ("+91…") open a chat; anything else is an email. */
export function sharedContactHref(contact: string): { href: string; isWhatsApp: boolean } {
  const digits = /^\+([0-9]{8,15})$/.exec(contact.trim());
  return digits ? { href: whatsappChatUrl(digits[1]!), isWhatsApp: true } : { href: `mailto:${contact}`, isWhatsApp: false };
}
