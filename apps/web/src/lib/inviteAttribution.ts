import { api } from "../api/client";

const KEY = "alma.inviteRef";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A remembered invite is only worth claiming for a few days. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type Stored = { ref: string; ch: "copy" | "whatsapp"; at: number };

/** On /login: remember `?ref=&ch=` from an invite link until the person finishes signing in. */
export function rememberInviteFromUrl(search: string, now = Date.now()): void {
  try {
    const params = new URLSearchParams(search);
    const ref = params.get("ref") ?? "";
    const ch = params.get("ch") === "whatsapp" ? "whatsapp" : "copy";
    if (!UUID.test(ref)) return;
    window.localStorage.setItem(KEY, JSON.stringify({ ref, ch, at: now } satisfies Stored));
  } catch {
    /* storage may be blocked; attribution is best effort */
  }
}

/**
 * After a successful sign-in: send the remembered invite once, then forget it. The server only
 * credits brand-new members (first claim wins, no self-invites), so this is safe for everyone.
 */
export async function claimRememberedInvite(now = Date.now()): Promise<void> {
  let stored: Stored | null = null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    window.localStorage.removeItem(KEY);
    stored = JSON.parse(raw) as Stored;
  } catch {
    return;
  }
  if (!stored || !UUID.test(stored.ref) || now - stored.at > MAX_AGE_MS) return;
  await api.post("/v1/me/invited-by", { ref: stored.ref, channel: stored.ch }).catch(() => undefined);
}
