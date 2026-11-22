import { appBaseUrl } from "./appBase";
import { copyText } from "./inviteLink";

/**
 * Sharing a Wall post: the link is the Wall (Home) plus `#wall-<post id>`. Only the post's id is in the
 * link, never its text or the author's name, and the part after `#` isn't sent to the server, so a link
 * preview or a signed-out visitor learns nothing about the post. Opening it needs a signed-in member who
 * can see the post (the post-audience rules apply).
 */

/** The page that hosts The Wall (router path, under the app base). */
export const WALL_ROUTE = "/home";

const HASH_PREFIX = "wall-";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** DOM id of a post on The Wall (also the link's `#…` target). */
export function wallPostAnchorId(postId: string): string {
  return `${HASH_PREFIX}${postId}`;
}

/** e.g. "https://almamatter.in/app/home#wall-<uuid>" (origin and base come from where the app is running). */
export function wallPostShareUrl(postId: string, origin?: string): string {
  return `${appBaseUrl(origin)}${WALL_ROUTE}#${wallPostAnchorId(postId)}`;
}

/** The post id in `#wall-<uuid>`, or null for any other hash. */
export function parseWallHash(hash: string | null | undefined): string | null {
  if (!hash) return null;
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw.startsWith(HASH_PREFIX)) return null;
  const id = raw.slice(HASH_PREFIX.length);
  return UUID_RE.test(id) ? id.toLowerCase() : null;
}

/** Phones and tablets (a touch screen as the main pointer) that offer the system share sheet. */
export function canUseShareSheet(): boolean {
  try {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
    return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

export type WallShareResult = "shared" | "copied" | "cancelled" | "failed";

/**
 * Share a post's link: the phone's share sheet where there is one (link only, no post text), otherwise
 * copy it. A share sheet the person closes is "cancelled" (no message). If the sheet fails for another
 * reason, fall back to copying.
 */
export async function shareWallPost(postId: string): Promise<WallShareResult> {
  const url = wallPostShareUrl(postId);
  if (canUseShareSheet()) {
    try {
      await navigator.share({ url });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
      /* not allowed here: copy instead */
    }
  }
  return (await copyText(url)) ? "copied" : "failed";
}
