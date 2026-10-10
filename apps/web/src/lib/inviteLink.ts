/** Invite links point at the sign-up page. No new backend, just a link worth sending. */
export function buildInviteLink(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/login`;
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
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
