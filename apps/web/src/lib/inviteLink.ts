export type InviteChannel = "copy" | "whatsapp";

/**
 * Invite links point at the sign-up page. With an inviter, they carry `ref` and `ch` so a new
 * member's sign-up can be credited to the invite (see lib/inviteAttribution.ts).
 */
export function buildInviteLink(origin: string, inviterPersonId?: string | null, channel: InviteChannel = "copy"): string {
  const base = `${origin.replace(/\/+$/, "")}/login`;
  if (!inviterPersonId) return base;
  return `${base}?ref=${encodeURIComponent(inviterPersonId)}&ch=${channel}`;
}

export function buildInviteMessage(link: string): string {
  return `I'm on Alma Mater, the IIT BHU alumni network. Come join so we can finally find each other: ${link}`;
}

export function buildWhatsAppShareUrl(link: string): string {
  return `https://wa.me/?text=${encodeURIComponent(buildInviteMessage(link))}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the old-school route */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    try {
      ta.select();
      return document.execCommand("copy");
    } finally {
      ta.remove();
    }
  } catch {
    return false;
  }
}
